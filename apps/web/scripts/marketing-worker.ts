/**
 * BullMQ worker: process "marketing-generate" jobs for campaign content generation.
 * Run from apps/web: npm run marketing-worker (requires REDIS_URL, Supabase env)
 *
 * AI-generated drafts per scheduled day and channel, awaiting author review.
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
  releaseBudget,
  BudgetExceededError,
  JobCostExceededError,
  validateJobCost,
} from "../src/lib/workers/budget";
import { expandSchedule } from "../src/lib/marketing/expand-schedule";
import { acquireMarketingModelFence } from "../src/lib/marketing/model-work-fence";
import { createMarketingWork } from "../src/lib/marketing/model-work";
import { generateLaunchCopy } from "../src/lib/marketing/launch-copy-provider";
import { createHash } from "node:crypto";
import type {
  CampaignPlanContentType,
  CampaignPlanTemplate,
} from "../src/lib/marketing/schemas";

import { QUEUE_NAMES } from "../src/lib/queue-names";
import { startHeartbeatInterval } from "../src/lib/health/worker-heartbeat";
import { Sentry } from "./sentry-worker-init";

const QUEUE_NAME = QUEUE_NAMES.MARKETING;

class MarketingModelAdmissionError extends UnrecoverableError {}

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

type ModelCheckpoint = (scope: string | null) => Promise<void>;

async function processCampaignPlanJob(
  payload: MarketingJobData,
  checkpoint: ModelCheckpoint,
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
    .select("id, title, description, author_id")
    .eq("id", plan.book_id)
    .single();

  if (bookErr || !book) {
    await markPlanFailed(supabase, planId, "book_not_found");
    throw new UnrecoverableError(`Book missing: ${bookErr?.message ?? plan.book_id}`);
  }

  if (book.author_id !== plan.author_id) {
    await markPlanFailed(supabase, planId, "book_ownership_mismatch");
    throw new UnrecoverableError("Ownership mismatch on campaign book");
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

  // Read every saved slot so a retry resumes partial work without replacing edits.
  type SavedPost = {
    scheduled_for: string; channel: string; language: string;
    content_type: string; caption: string | null;
  };
  const saved: SavedPost[] = [];
  const slotKey = (date: string, channel: string, language: string, contentType: string) =>
    JSON.stringify([new Date(date).toISOString(), channel, language, contentType]);

  try {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("marketing_posts")
        .select("scheduled_for, channel, language, content_type, caption")
        .eq("campaign_plan_id", planId)
        .order("id")
        .range(offset, offset + 999);
      if (error) throw new Error(`Could not read existing campaign posts: ${error.message}`);
      saved.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
    const completed = new Set(saved.map((post) =>
      slotKey(post.scheduled_for, post.channel, post.language, post.content_type)
    ));
    const normalizeCopy = (text: string) => text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const angles = [
      "Introduce the book using one detail from its description.",
      "Invite a reader question grounded in the book description.",
      "Highlight a different supplied detail without inventing quotes or reviews.",
      "Invite readers to discover the book with a fresh opening and call to action.",
    ];
    let generated = 0;
    for (const post of expanded) {
      const scheduledFor = post.scheduledFor.toISOString();
      const key = slotKey(scheduledFor, post.channel, post.language, post.contentType);
      if (completed.has(key)) continue;
      const day = Math.floor((post.scheduledFor.getTime() - new Date(`${plan.start_date}T00:00:00Z`).getTime()) / 86_400_000) + 1;
      const previousBodies = saved
        .filter((row) => row.channel === post.channel && row.language === post.language)
        .map((row) => row.caption ?? "").filter(Boolean);
      const copyInput = {
        authorId: payload.authorId,
        title: book.title ?? "Untitled",
        description: book.description,
        language: post.language,
        channel: post.channel,
        campaign: {
          goal: plan.template,
          scheduledFor: scheduledFor.slice(0, 10),
          day,
          contentType: post.contentType,
          angle: angles[(day - 1) % angles.length],
          previousBodies: previousBodies.slice(-4),
        },
      };
      // Persist the unresolved scope before any model work. A stalled/retried job
      // must stop here for reconciliation rather than reset its in-memory cap.
      await checkpoint(key);
      const work = createMarketingWork(payload.authorId);
      let copy = await generateLaunchCopy(copyInput, work);
      const repeated = () => previousBodies.some((body) => normalizeCopy(body) === normalizeCopy(copy.body));
      if (repeated()) copy = await generateLaunchCopy(copyInput, work);
      if (repeated()) throw new Error("AI returned repeated campaign copy. Retry generation to create a distinct draft.");

      // A deterministic ID protects against an uncertain insert result on retry.
      // Ignore conflicts so saved edits and author approvals are never overwritten.
      const hash = createHash("sha256").update(`${planId}:${key}`).digest("hex");
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      const row = {
        id,
        campaign_plan_id: planId,
        book_id: plan.book_id,
        author_id: plan.author_id,
        scheduled_for: scheduledFor,
        channel: post.channel,
        language: post.language,
        content_type: post.contentType,
        status: "draft",
        headline: copy.headline,
        caption: copy.body,
        hashtags: copy.hashtags,
        cta: copy.cta,
        share_url: `/reader/books/${plan.book_id}`,
        mode: "organic",
        paid_config: {},
        metadata: { variantIndex: post.variantIndex, langLabel: getLanguageLabel(post.language), campaignDay: day, goal: plan.template },
      };
      const { error: insertErr } = await supabase.from("marketing_posts").upsert(row, { onConflict: "id", ignoreDuplicates: true });
      if (insertErr) throw new Error(`Could not save campaign draft: ${insertErr.message}`);
      await checkpoint(null);
      saved.push(row);
      completed.add(key);
      generated++;
    }

    const { error: statusError } = await supabase
      .from("marketing_campaign_plans")
      .update({ status: "active", generation_error: null })
      .eq("id", planId);
    if (statusError) throw new Error(`Could not finish campaign generation: ${statusError.message}`);

    console.log("[marketing worker] plan drafts generated", { planId, generated, total: expanded.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign generation failed";
    console.error("[marketing worker] plan generation failed", { planId, error: message });
    await markPlanFailed(supabase, planId, message);
    throw error;
  }
}

async function markPlanFailed(
  supabase: ReturnType<typeof createAdminClient>,
  planId: string,
  error: string
): Promise<void> {
  const { error: updateError } = await supabase
    .from("marketing_campaign_plans")
    .update({ status: "failed", generation_error: error.slice(0, 500) })
    .eq("id", planId);
  if (updateError) console.error("[marketing worker] could not mark plan failed", { planId, error: updateError.message });
}

const CHANNELS = ["generic", "tiktok", "instagram", "x"] as const;
type Channel = (typeof CHANNELS)[number];

function isChannel(s: string): s is Channel {
  return CHANNELS.includes(s as Channel);
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

async function processJob(payload: MarketingJobData, checkpoint: ModelCheckpoint, workerJobId?: string) {
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
    .select("id, title, description, author_id")
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

    await checkpoint(JSON.stringify([bookId, language, channel]));
    const copy = await generateLaunchCopy({
      authorId,
      title: book.title, description: book.description, language, channel,
    });

    const campaign = {
      book_id: bookId,
      language,
      channel,
      status: "generated" as const,
      headline: copy.headline,
      caption: copy.body,
      cta: copy.cta,
      hashtags: copy.hashtags,
      share_url: `/reader/books/${bookId}`,
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

    await checkpoint(null);
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

      let fence: Awaited<ReturnType<typeof acquireMarketingModelFence>>;
      try {
        fence = await acquireMarketingModelFence(await worker.client, data.authorId, workerJobId ?? "");
      } catch {
        console.error("[marketing worker] exclusive model admission unavailable", { jobId: workerJobId });
        throw new MarketingModelAdmissionError("Marketing model work is reserved or could not be reserved safely. Review its outcome before retrying.");
      }
      try {
        if (data.modelWorkPending) {
          const message = "Unresolved marketing model work. Review saved drafts and usage before requesting a new generation.";
          console.error("[marketing worker] automatic model replay blocked", { jobId: workerJobId });
          if (data.campaignPlanId) await markPlanFailed(createAdminClient(), data.campaignPlanId, message);
          throw new UnrecoverableError(message);
        }
        const checkpoint: ModelCheckpoint = async scope => {
          // Set the local fence first; even an uncertain Redis write is terminal.
          if (scope !== null) data.modelWorkPending = scope;
          try {
            await job.updateData({ ...data, modelWorkPending: scope });
            data.modelWorkPending = scope;
          } catch {
            throw new UnrecoverableError("Marketing model checkpoint could not be saved. Automatic generation stopped.");
          }
        };
        try {
          if (data.campaignPlanId) {
            await processCampaignPlanJob(data, checkpoint, workerJobId);
          } else {
            await processJob(data, checkpoint, workerJobId);
          }
        } catch (error) {
          // Budget/usage failures, unknown results and uncertain draft writes cannot
          // restart paid work with a fresh cap on BullMQ's next attempt.
          if (data.modelWorkPending) throw new UnrecoverableError(error instanceof Error ? error.message : "Marketing model work stopped");
          throw error;
        }
      } finally {
        // Only this Redis owner may release, and never while paid work is unresolved.
        if (!data.modelWorkPending) {
          try { await fence.release(); }
          catch { throw new UnrecoverableError("Marketing reservation release is uncertain. Review saved drafts before retrying."); }
        }
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
    // On a TERMINAL failure (retries exhausted or stall-out), refund the
    // reserved video budget so a failed render never permanently consumes the
    // author's daily allowance. Idempotent + best-effort (never throws).
    void (async () => {
      const attempts = job?.opts?.attempts ?? 1;
      const made = job?.attemptsMade ?? 0;
      // Match BullMQ's exact stall-out message so an arbitrary error whose
      // text merely contains "stalled" cannot trip the terminal override.
      const stalledOut = /stalled more than allowable limit/i.test(err?.message ?? "");
      // A losing concurrent processor never owns the winning job's video reservation.
      if (err instanceof MarketingModelAdmissionError) return;
      if (made < attempts && !stalledOut && !(err instanceof UnrecoverableError)) return;
      await releaseBudget({
        pipeline: "video",
        jobId: job?.id != null ? String(job.id) : null,
      });
    })();
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
