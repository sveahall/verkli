/**
 * BullMQ worker: process marketing queue jobs.
 * Run from apps/web: npm run marketing-worker (requires REDIS_URL, Supabase env)
 *
 * Handles:
 * - marketing-generate (campaign copy generation)
 * - trailer-build (trailer prompt + image-to-video + stitching + upload)
 * - marketing-video-generate (single teaser video generation + upload)
 * - text-to-video (Runway text-to-video)
 */

import "./load-dotenv";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

import { Worker, UnrecoverableError } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import type {
  MarketingJobData,
  MarketingVideoGenerateJobData,
  TextToVideoJobData,
  TrailerBuildJobData,
} from "../src/lib/marketing-queue";
import { getLanguageLabel } from "../src/lib/languages";
import { isDuplicate } from "../src/lib/workers/idempotency";
import { checkBudget, trackUsage, BudgetExceededError } from "../src/lib/workers/budget";
import { generateTrailerPrompt, type TrailerGenerateRequest } from "../src/lib/ai/trailer-generation";
import { generateImageToVideo } from "../src/lib/higgsfield";
import { stitchSceneVideos } from "../src/lib/marketing/trailer-ffmpeg";
import { uploadTrailerAndGetPublicUrl } from "../src/lib/marketing/trailer-storage";
import { makeVideo } from "../src/lib/ai/textToVideo";
import { sanitizeJobErrorForStorage } from "../src/lib/sanitize-job-error";

import { QUEUE_NAMES } from "../src/lib/queue-names";

const QUEUE_NAME = QUEUE_NAMES.MARKETING;

const CHANNELS = ["generic", "tiktok", "instagram", "x"] as const;
type Channel = (typeof CHANNELS)[number];
const SCENE_DURATION_SECONDS = 5;
const MAX_SCENES = 3;
const TRAILER_DOWNLOAD_TIMEOUT_MS = 20_000;
const ESTIMATED_COST_USD = 0.15;

function isChannel(s: string): s is Channel {
  return CHANNELS.includes(s as Channel);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function updateJob(
  supabase: ReturnType<typeof createAdminClient>,
  jobId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("ai_jobs")
    .update(updates)
    .eq("id", jobId);

  if (error) {
    console.error("[marketing worker] failed to update ai_jobs row", {
      jobId,
      message: error.message,
      code: error.code,
    });
  }
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

async function processMarketingGenerateJob(payload: MarketingJobData) {
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

  // Budget gate
  try {
    checkBudget(authorId);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      console.warn("[marketing worker] budget exceeded for:", authorId);
      throw new UnrecoverableError(err.message);
    }
    throw err;
  }

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

  // Track usage (estimate: ~100 tokens per channel for template-based copy)
  const estimatedTokens = generated * 100;
  if (estimatedTokens > 0) {
    trackUsage(authorId, estimatedTokens);
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

async function processTrailerBuildJob(payload: TrailerBuildJobData) {
  const { jobId, assetId, userId, coverImageUrl, trailerRequest } = payload;
  const supabase = createAdminClient();

  await updateJob(supabase, jobId, {
    status: "processing",
    progress: 10,
    started_at: new Date().toISOString(),
    error: null,
  });

  try {
    const trailerResult = await generateTrailerPrompt(
      trailerRequest as TrailerGenerateRequest
    );
    const scenes = trailerResult.output.scenes.slice(0, MAX_SCENES);
    if (scenes.length === 0) {
      throw new UnrecoverableError("No trailer scenes returned.");
    }

    await updateJob(supabase, jobId, { progress: 45 });

    const sceneResults = await Promise.all(
      scenes.map((scene) =>
        generateImageToVideo({
          prompt: scene.visual_prompt,
          imageUrl: coverImageUrl,
          durationSeconds: SCENE_DURATION_SECONDS,
        })
      )
    );

    const finalVideoBuffer = await stitchSceneVideos(
      sceneResults.map((result) => result.videoUrl)
    );

    const uploadResult = await uploadTrailerAndGetPublicUrl(
      supabase,
      userId,
      assetId,
      finalVideoBuffer,
      "video/mp4"
    );

    if ("error" in uploadResult) {
      throw new Error(uploadResult.error);
    }

    const providerRequestId = sceneResults.map((result) => result.requestId).join(",");
    const { error: readyUpdateError } = await supabase
      .from("media_assets")
      .update({
        status: "ready",
        provider: "higgsfield",
        provider_request_id: providerRequestId,
        output_url: uploadResult.publicUrl,
        metadata: trailerResult.output,
        duration_seconds: scenes.length * SCENE_DURATION_SECONDS,
        error: null,
      })
      .eq("id", assetId)
      .eq("user_id", userId);

    if (readyUpdateError) {
      throw new Error(`Failed to mark media asset ready: ${readyUpdateError.message}`);
    }

    await updateJob(supabase, jobId, {
      status: "completed",
      progress: 100,
      finished_at: new Date().toISOString(),
      output: {
        assetId,
        url: uploadResult.publicUrl,
        sceneCount: scenes.length,
        providerRequestId,
      },
      error: null,
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const safeMessage =
      sanitizeJobErrorForStorage(rawMessage) ??
      "Något gick fel under bearbetningen. Försök igen.";

    await supabase
      .from("media_assets")
      .update({
        status: "failed",
        error: safeMessage,
      })
      .eq("id", assetId)
      .eq("user_id", userId);

    await updateJob(supabase, jobId, {
      status: "failed",
      progress: 0,
      finished_at: new Date().toISOString(),
      error: safeMessage,
    });

    throw err;
  }
}

async function processMarketingVideoGenerateJob(
  payload: MarketingVideoGenerateJobData
) {
  const { jobId, assetId, userId, prompt, imageUrl, metadata } = payload;
  const supabase = createAdminClient();

  await updateJob(supabase, jobId, {
    status: "processing",
    progress: 10,
    started_at: new Date().toISOString(),
    error: null,
  });

  try {
    const startMs = Date.now();
    const { requestId, videoUrl } = await generateImageToVideo({ prompt, imageUrl });
    await updateJob(supabase, jobId, { progress: 55 });

    const res = await fetchWithTimeout(videoUrl, TRAILER_DOWNLOAD_TIMEOUT_MS);
    if (!res.ok) {
      throw new Error(`Failed to fetch trailer from provider: ${res.status}`);
    }
    const videoBuffer = await res.arrayBuffer();

    const uploadResult = await uploadTrailerAndGetPublicUrl(
      supabase,
      userId,
      assetId,
      videoBuffer,
      res.headers.get("content-type") || "video/mp4"
    );

    if ("error" in uploadResult) {
      throw new Error(`Trailer storage upload failed: ${uploadResult.error}`);
    }

    const generationTimeMs = Date.now() - startMs;
    const persistedMetadata = {
      ...(metadata?.scenes != null && { scenes: metadata.scenes }),
      ...(metadata?.caption != null && { caption: metadata.caption }),
      ...(metadata?.hashtags != null && { hashtags: metadata.hashtags }),
      generation_time_ms: generationTimeMs,
    };

    const { error: updateReadyError } = await supabase
      .from("media_assets")
      .update({
        status: "ready",
        provider: "higgsfield",
        provider_request_id: requestId,
        output_url: uploadResult.publicUrl,
        metadata: persistedMetadata,
        estimated_cost_usd: ESTIMATED_COST_USD,
        error: null,
      })
      .eq("id", assetId)
      .eq("user_id", userId);

    if (updateReadyError) {
      throw new Error(`Failed to mark media asset ready: ${updateReadyError.message}`);
    }

    await updateJob(supabase, jobId, {
      status: "completed",
      progress: 100,
      finished_at: new Date().toISOString(),
      output: {
        assetId,
        url: uploadResult.publicUrl,
        providerRequestId: requestId,
      },
      error: null,
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const safeMessage =
      sanitizeJobErrorForStorage(rawMessage) ??
      "Något gick fel under bearbetningen. Försök igen.";

    await supabase
      .from("media_assets")
      .update({
        status: "failed",
        error: safeMessage,
      })
      .eq("id", assetId)
      .eq("user_id", userId);

    await updateJob(supabase, jobId, {
      status: "failed",
      progress: 0,
      finished_at: new Date().toISOString(),
      error: safeMessage,
    });

    throw err;
  }
}

async function processTextToVideoJob(payload: TextToVideoJobData) {
  const { jobId, userId, options } = payload;
  const supabase = createAdminClient();

  await updateJob(supabase, jobId, {
    status: "processing",
    progress: 10,
    started_at: new Date().toISOString(),
    error: null,
  });

  try {
    const result = await makeVideo(options);
    await updateJob(supabase, jobId, {
      status: "completed",
      progress: 100,
      finished_at: new Date().toISOString(),
      output: result,
      error: null,
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const safeMessage =
      sanitizeJobErrorForStorage(rawMessage) ??
      "Något gick fel under bearbetningen. Försök igen.";

    await updateJob(supabase, jobId, {
      status: "failed",
      progress: 0,
      finished_at: new Date().toISOString(),
      error: safeMessage,
    });

    throw err;
  }
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

  console.log("[marketing worker] worker started — queue:", QUEUE_NAME, "redis:", connection.host + ":" + connection.port);

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (!job.data) {
        console.warn("[marketing worker] job missing data:", job.id, job.name);
        return;
      }

      switch (job.name) {
        case "marketing-generate":
          await processMarketingGenerateJob(job.data as MarketingJobData);
          return;
        case "trailer-build":
          await processTrailerBuildJob(job.data as TrailerBuildJobData);
          return;
        case "marketing-video-generate":
          await processMarketingVideoGenerateJob(job.data as MarketingVideoGenerateJobData);
          return;
        case "text-to-video":
          await processTextToVideoJob(job.data as TextToVideoJobData);
          return;
        default:
          throw new UnrecoverableError(`Unexpected marketing job name: ${job.name}`);
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
    console.error("[marketing worker] job failed:", job?.id, err?.message);
  });
  worker.on("error", (err) => {
    console.error("[marketing worker] Redis/queue error:", err.message);
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[marketing worker] shutting down...");
    await worker.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[marketing worker] shutting down...");
    await worker.close();
    process.exit(0);
  });
}

main();
