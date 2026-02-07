/**
 * BullMQ worker: process "generate" jobs for TTS output.
 * Queue: tts-generation
 * Tracking: ai_jobs (kind='tts_generation')
 */

import "./load-dotenv";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

assertServerEnv();

import { Worker } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import { synthesizeTextToWavBytes } from "../src/lib/tts/piper";
import { getTtsStorageBucket } from "../src/lib/tts/storage";
import { QUEUE_NAMES } from "../src/lib/queue-names";

const QUEUE_NAME = QUEUE_NAMES.TTS;
const BUCKET = getTtsStorageBucket();

type TtsJobData = {
  jobId: string;
  userId: string;
};

type TtsJobInput = {
  bookId?: string;
  text?: string;
  language?: string;
  voiceId?: string;
};

async function processJob(payload: TtsJobData) {
  const { jobId, userId } = payload;
  const supabase = createAdminClient();

  const updateJob = async (
    status: "processing" | "completed" | "failed",
    outputUpdate: Record<string, unknown> = {},
    error?: string
  ) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };

    if (status === "processing") {
      updates.started_at = now;
    }
    if (status === "completed" || status === "failed") {
      updates.finished_at = now;
    }
    if (error) {
      updates.error = error;
    }

    const { data: current } = await supabase
      .from("ai_jobs")
      .select("output")
      .eq("id", jobId)
      .maybeSingle();

    const currentOutput = (current?.output as Record<string, unknown>) ?? {};
    updates.output = { ...currentOutput, ...outputUpdate };

    await supabase.from("ai_jobs").update(updates).eq("id", jobId);
  };

  try {
    const { data: jobRow, error: jobFetchError } = await supabase
      .from("ai_jobs")
      .select("id, kind, user_id, input")
      .eq("id", jobId)
      .maybeSingle();

    if (jobFetchError || !jobRow) {
      throw new Error(jobFetchError?.message ?? `Job not found: ${jobId}`);
    }

    if (jobRow.kind !== "tts_generation") {
      throw new Error(`Unexpected job kind for ${jobId}: ${jobRow.kind}`);
    }

    if (jobRow.user_id !== userId) {
      throw new Error("Ownership mismatch: payload userId does not match ai_jobs.user_id");
    }

    const input = (jobRow.input as TtsJobInput | null) ?? {};
    const text = String(input.text ?? "").trim();

    if (!text) {
      throw new Error("Missing input.text for tts_generation job");
    }

    await updateJob("processing", {
      bookId: input.bookId ?? null,
      language: input.language ?? null,
      voiceId: input.voiceId ?? null,
    });

    const wavBuffer = await synthesizeTextToWavBytes(text);
    const storagePath = `${input.bookId ?? "tts"}/${jobId}-${Date.now()}.wav`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, wavBuffer, {
        contentType: "audio/wav",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const audioUrl = urlData?.publicUrl ?? null;

    if (!audioUrl) {
      throw new Error("Could not resolve public URL for uploaded TTS audio");
    }

    if (input.bookId) {
      const language = String(input.language ?? "en").slice(0, 10);
      await supabase.from("audiobook_assets").insert({
        book_id: input.bookId,
        language,
        status: "generated",
        audio_url: audioUrl,
      });
    }

    await updateJob("completed", {
      bucket: BUCKET,
      storagePath,
      audioUrl,
      fileSizeBytes: wavBuffer.length,
      chars: text.length,
    });

    console.log("[tts worker] completed -", jobId, "path:", storagePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateJob("failed", {}, msg);
    console.error("[tts worker] failed -", jobId, msg);
    throw err;
  }
}

function main() {
  const url = process.env.REDIS_URL ?? "";
  if (!url || url.trim() === "") {
    console.error("[tts worker] REDIS_URL not set.");
    process.exit(1);
  }

  const connection = getRedisConnectionOptions();
  if (!connection) {
    console.error("[tts worker] Redis not reachable.");
    process.exit(1);
  }

  console.log("[tts worker] started - queue:", QUEUE_NAME);

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "generate" && job.data) {
        await processJob(job.data as TtsJobData);
      }
    },
    {
      connection: {
        host: connection.host,
        port: connection.port,
        password: connection.password,
      },
      concurrency: 1,
    }
  );

  worker.on("completed", (job) => {
    console.log("[tts worker] job completed:", job.id);
  });

  worker.on("failed", (job, err) => {
    console.error("[tts worker] job failed:", job?.id, err?.message);
  });

  worker.on("error", (err) => {
    console.error("[tts worker] error:", err.message);
  });

  process.on("SIGTERM", async () => {
    console.log("[tts worker] shutting down...");
    await worker.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[tts worker] shutting down...");
    await worker.close();
    process.exit(0);
  });
}

main();
