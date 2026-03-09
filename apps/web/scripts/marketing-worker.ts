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

import { QUEUE_NAMES } from "../src/lib/queue-names";
import { startHeartbeatInterval } from "../src/lib/health/worker-heartbeat";
import { Sentry } from "./sentry-worker-init";

const QUEUE_NAME = QUEUE_NAMES.MARKETING;

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
      if (job.name === "marketing-generate" && job.data) {
        console.log("[marketing-worker] processing job", job.id);
        const workerJobId = job.id != null ? String(job.id) : undefined;
        await processJob(job.data as MarketingJobData, workerJobId);
      }
    },
    {
      connection: {
        host: connection.host,
        port: connection.port,
        password: connection.password,
      },
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
