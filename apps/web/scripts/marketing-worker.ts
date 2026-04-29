/**
 * BullMQ worker: process "marketing-generate" jobs for campaign content generation.
 * Run from apps/web: npm run marketing-worker (requires REDIS_URL, Supabase env)
 *
 * Template-based copy generation per channel. No AI calls yet — budget gate
 * protects future AI integration.
 */

import "./load-dotenv";
import "./sentry-worker-init";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

import { Worker, UnrecoverableError } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import type { MarketingJobData } from "../src/lib/marketing-queue";
import { getLanguageLabel } from "../src/lib/languages";
import { isDuplicate } from "../src/lib/workers/idempotency";
import {
  checkBudget,
  BudgetExceededError,
  JobCostExceededError,
  validateJobCost,
} from "../src/lib/workers/budget";
import { expandSchedule } from "../src/lib/marketing/expand-schedule";
import { buildPostCopy } from "../src/lib/marketing/post-templates";
import type {
  CampaignPlanContentType,
  CampaignPlanTemplate,
} from "../src/lib/marketing/schemas";

import { QUEUE_NAMES } from "../src/lib/queue-names";
import { startHeartbeatInterval } from "../src/lib/health/worker-heartbeat";
import { Sentry } from "./sentry-worker-init";

const QUEUE_NAME = QUEUE_NAMES.MARKETING;

type CampaignPlan = {
  id: string;
  book_id: string;
  author_id: string;
  template: CampaignPlanTemplate;
  channels: string[];
  languages: string[];
  content_types: string[];
  start_date: string;
  duration_weeks: number;
  weekly_schedule: Record<string, string[]>;
};

async function processCampaignPlanJob(
  payload: MarketingJobData,
  workerJobId?: string
): Promise<void> {
  if (!payload.campaignPlanId) {
    throw new UnrecoverableError("campaignPlanId missing on job");
  }

  const supabase = createAdminClient();
  const planId = payload.campaignPlanId;

  console.log("[marketing worker] expanding plan:", planId);

  const { data: planRaw, error: planErr } = await supabase
    .from("marketing_campaign_plans")
    .select(
      `id, book_id, author_id, template, channels, languages, content_types,
       start_date, duration_weeks, weekly_schedule`
    )
    .eq("id", planId)
    .maybeSingle();

  if (planErr || !planRaw) {
    throw new UnrecoverableError(
      `Plan not found: ${planErr?.message ?? planId}`
    );
  }

  const plan = planRaw as unknown as CampaignPlan;

  if (plan.author_id !== payload.authorId) {
    throw new UnrecoverableError("Ownership mismatch on campaign plan");
  }

  const { data: book, error: bookErr } = await supabase
    .from("books")
    .select("id, title, author_id")
    .eq("id", plan.book_id)
    .single();

  if (bookErr || !book) {
    await markPlanFailed(supabase, planId, "book_not_found");
    throw new UnrecoverableError(`Book missing: ${bookErr?.message ?? plan.book_id}`);
  }

  const expanded = expandSchedule({
    startDate: plan.start_date,
    durationWeeks: plan.duration_weeks,
    weeklySchedule: plan.weekly_schedule,
    languages: plan.languages,
    contentTypes: plan.content_types as CampaignPlanContentType[],
    template: plan.template,
  });

  if (expanded.length === 0) {
    await markPlanFailed(supabase, planId, "empty_schedule");
    throw new UnrecoverableError("Schedule expanded to zero posts");
  }

  // Cost gate sized by post volume
  const estimatedCostUnits = Math.max(1, Math.ceil(expanded.length / 10));
  try {
    validateJobCost({
      userId: payload.authorId,
      pipeline: "video",
      jobSize: estimatedCostUnits,
      jobId: workerJobId ?? null,
    });
    await checkBudget({
      userId: payload.authorId,
      pipeline: "video",
      units: estimatedCostUnits,
      jobId: workerJobId ?? null,
    });
  } catch (err) {
    if (err instanceof BudgetExceededError || err instanceof JobCostExceededError) {
      await markPlanFailed(supabase, planId, err.message);
      throw new UnrecoverableError(err.message);
    }
    throw err;
  }

  // Skip if posts already exist for this plan (re-run protection)
  const alreadyDone = await isDuplicate(async () => {
    const { count } = await supabase
      .from("marketing_posts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_plan_id", planId);
    return (count ?? 0) > 0;
  }, `marketing-plan:${planId}`);

  if (alreadyDone) {
    console.log("[marketing worker] plan already expanded, skipping:", planId);
    await supabase
      .from("marketing_campaign_plans")
      .update({ status: "active", generation_error: null })
      .eq("id", planId);
    return;
  }

  const rows = expanded.map((post) => {
    const copy = buildPostCopy({
      bookId: plan.book_id,
      bookTitle: book.title ?? "Untitled",
      language: post.language,
      channel: post.channel,
      contentType: post.contentType,
      template: plan.template,
      variantIndex: post.variantIndex,
    });

    // Trailer + podcast posts start as draft (need on-demand asset generation).
    // Text posts are immediately ready.
    const status: string = post.contentType === "text" ? "ready" : "draft";

    return {
      campaign_plan_id: planId,
      book_id: plan.book_id,
      author_id: plan.author_id,
      scheduled_for: post.scheduledFor.toISOString(),
      channel: post.channel,
      language: post.language,
      content_type: post.contentType,
      status,
      headline: copy.headline,
      caption: copy.caption,
      hashtags: copy.hashtags,
      cta: copy.cta,
      share_url: copy.shareUrl,
      mode: "organic",
      paid_config: {},
      metadata: { variantIndex: post.variantIndex, langLabel: getLanguageLabel(post.language) },
    };
  });

  // Insert in chunks to avoid payload limits
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error: insertErr } = await supabase.from("marketing_posts").insert(slice);
    if (insertErr) {
      console.error("[marketing worker] insert failed:", insertErr.message);
      await markPlanFailed(supabase, planId, insertErr.message);
      throw new Error(insertErr.message);
    }
  }

  await supabase
    .from("marketing_campaign_plans")
    .update({ status: "active", generation_error: null })
    .eq("id", planId);

  console.log(
    "[marketing worker] plan expanded — planId:",
    planId,
    "posts:",
    rows.length
  );
}

async function markPlanFailed(
  supabase: ReturnType<typeof createAdminClient>,
  planId: string,
  error: string
): Promise<void> {
  await supabase
    .from("marketing_campaign_plans")
    .update({ status: "failed", generation_error: error.slice(0, 500) })
    .eq("id", planId);
}

const CHANNELS = ["generic", "tiktok", "instagram", "x"] as const;
type Channel = (typeof CHANNELS)[number];

function isChannel(s: string): s is Channel {
  return CHANNELS.includes(s as Channel);
}

function generateCopy(
  bookTitle: string,
  bookId: string,
  language: string,
  channel: Channel
) {
  const langLabel = getLanguageLabel(language);
  const readerPath = `/reader/books/${bookId}`;

  const headline = `${bookTitle} – now in ${langLabel}`;
  const cta = "Read on Verkli";

  let caption: string;
  let hashtags: string | null;

  switch (channel) {
    case "tiktok":
      caption = `Just dropped: ${bookTitle} in ${langLabel} on Verkli. Link in bio!`;
      hashtags = "#Verkli #BookTok #reading #newrelease";
      break;
    case "instagram":
      caption = `New release: ${bookTitle} is now available in ${langLabel}. Tap the link to start reading on Verkli.`;
      hashtags = "#Verkli #bookstagram #reading #translation";
      break;
    case "x":
      caption = `Just published: ${bookTitle} in ${langLabel} on Verkli. Read it here: ${readerPath}`;
      hashtags = "#Verkli #translation #read";
      break;
    default:
      caption = `Just published: ${bookTitle} in ${langLabel} on Verkli. Read it here: ${readerPath}`;
      hashtags = null;
      break;
  }

  return { headline, caption, cta, hashtags, share_url: readerPath };
}

function assertWorkerEnv(): void {
  try {
    assertServerEnv();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[marketing worker] ${msg}`);
    process.exit(1);
  }
}

async function processJob(payload: MarketingJobData, workerJobId?: string) {
  const { bookId, authorId, channels, language } = payload;
  const supabase = createAdminClient();

  console.log(
    "[marketing worker] job received — bookId:",
    bookId,
    "authorId:",
    authorId,
    "channels:",
    channels.join(","),
    "language:",
    language
  );

  // Fetch book
  const { data: book, error: bookFetchError } = await supabase
    .from("books")
    .select("id, title, author_id")
    .eq("id", bookId)
    .single();

  if (bookFetchError || !book) {
    throw new UnrecoverableError(bookFetchError?.message ?? "Book not found");
  }

  if (book.author_id !== authorId) {
    throw new UnrecoverableError("Ownership mismatch: authorId does not match book owner");
  }

  const validChannels = channels.filter(isChannel);
  if (validChannels.length === 0) {
    throw new UnrecoverableError("No valid channels provided");
  }
  const estimatedCostUnits = Math.max(1, validChannels.length);

  // Budget gate (video pipeline cost-units)
  try {
    validateJobCost({
      userId: authorId,
      pipeline: "video",
      jobSize: estimatedCostUnits,
      jobId: workerJobId ?? null,
    });
    await checkBudget({
      userId: authorId,
      pipeline: "video",
      units: estimatedCostUnits,
      jobId: workerJobId ?? null,
    });
  } catch (err) {
    if (err instanceof BudgetExceededError || err instanceof JobCostExceededError) {
      throw new UnrecoverableError(err.message);
    }
    throw err;
  }

  let generated = 0;

  for (const channel of validChannels) {
    // Dedupe: skip if campaign already generated for this combination
    const alreadyDone = await isDuplicate(async () => {
      const { data: existing } = await supabase
        .from("marketing_campaigns")
        .select("id, status")
        .eq("book_id", bookId)
        .eq("language", language)
        .eq("channel", channel)
        .eq("status", "generated")
        .maybeSingle();
      return !!existing;
    }, `marketing:${bookId}:${language}:${channel}`);

    if (alreadyDone) {
      console.log("[marketing worker] dedupe skip — campaign already generated for channel:", channel);
      continue;
    }

    const copy = generateCopy(book.title, bookId, language, channel);

    const campaign = {
      book_id: bookId,
      language,
      channel,
      status: "generated" as const,
      headline: copy.headline,
      caption: copy.caption,
      cta: copy.cta,
      hashtags: copy.hashtags,
      share_url: copy.share_url,
    };

    const { error: upsertError } = await supabase
      .from("marketing_campaigns")
      .upsert(campaign, { onConflict: "book_id,language,channel" })
      .select()
      .single();

    if (upsertError) {
      console.error("[marketing worker] upsert failed for channel:", channel, upsertError.message);
      throw new Error(`Failed to upsert campaign for channel ${channel}: ${upsertError.message}`);
    }

    console.log("[marketing worker] campaign upserted — channel:", channel);
    generated++;
  }

  console.log(
    "[marketing worker] completed — bookId:",
    bookId,
    "channels generated:",
    generated,
    "of",
    validChannels.length
  );
}

function main() {
  assertWorkerEnv();

  const url = process.env.REDIS_URL ?? "";
  if (!url || url.trim() === "") {
    console.error("[marketing worker] REDIS_URL not set. Set REDIS_URL and ensure Redis is running.");
    process.exit(1);
  }

  const connection = getRedisConnectionOptions();
  if (!connection) {
    console.error("[marketing worker] Redis not reachable. Check REDIS_URL.");
    process.exit(1);
  }

  console.log("[marketing-worker] started", { queue: QUEUE_NAME, redis: connection.host + ":" + connection.port });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name !== "marketing-generate" || !job.data) return;
      console.log("[marketing-worker] processing job", job.id);
      const workerJobId = job.id != null ? String(job.id) : undefined;
      const data = job.data as MarketingJobData;

      if (data.campaignPlanId) {
        await processCampaignPlanJob(data, workerJobId);
      } else {
        await processJob(data, workerJobId);
      }
    },
    {
      connection: { ...connection },
      concurrency: 2,
      stalledInterval: 30_000,
      maxStalledCount: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log("[marketing worker] job completed:", job.id);
  });
  worker.on("failed", (job, err) => {
    Sentry.captureException(err);
    console.error("[marketing-worker] job failed", job?.id, err?.message);
  });
  worker.on("error", (err) => {
    console.error("[marketing worker] Redis/queue error:", err.message);
  });

  const heartbeatInterval = startHeartbeatInterval(QUEUE_NAME);

  worker.on("closed", () => clearInterval(heartbeatInterval));

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[marketing worker] shutting down...");
    clearInterval(heartbeatInterval);
    await worker.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[marketing worker] shutting down...");
    clearInterval(heartbeatInterval);
    await worker.close();
    process.exit(0);
  });
}

main();
