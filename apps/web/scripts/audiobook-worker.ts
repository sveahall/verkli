/**
 * BullMQ worker: process "generate" jobs for audiobook generation.
 * Run from apps/web: npm run audiobook-worker
 * Requires: REDIS_URL, TTS_BIN, TTS_MODEL_PATH, Supabase env
 *
 * Uses ai_jobs table for job tracking (kind='audiobook_generation').
 * Progress stored in ai_jobs.output JSON field.
 */

import "./load-dotenv";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import * as crypto from "crypto";
import { spawn } from "child_process";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

assertServerEnv();

import { Worker } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import { synthesizeTextToWavBytes } from "../src/lib/tts/piper";
import { getTtsStorageBucket } from "../src/lib/tts/storage";
import { QUEUE_NAMES } from "../src/lib/queue-names";
import type { AudiobookJobData } from "../src/lib/audiobook-queue";

const QUEUE_NAME = QUEUE_NAMES.AUDIOBOOK;
const BUCKET = getTtsStorageBucket();

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function computeContentHash(text: string, chapterId: string, versionId: string): string {
  const normalized = normalizeText(text);
  const input = `${normalized}|${chapterId}|${versionId}`;
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/** Extract plain text from TipTap JSON content */
function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if ("text" in n && typeof n.text === "string") {
    return n.text;
  }
  if ("content" in n && Array.isArray(n.content)) {
    return n.content.map(extractText).join("");
  }
  return "";
}

function getChapterText(content: string | null): string {
  if (!content) return "";
  try {
    const parsed = JSON.parse(content);
    return extractText(parsed);
  } catch {
    return String(content).trim();
  }
}

/** Estimate WAV duration from buffer (assumes standard WAV header) */
function estimateWavDuration(wav: Buffer): number {
  try {
    if (wav.length < 44) return 0;
    const byteRate = wav.readUInt32LE(28);
    if (byteRate <= 0) return 0;
    const dataSize = wav.length - 44;
    return Math.round(dataSize / byteRate);
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio Stitching
// ─────────────────────────────────────────────────────────────────────────────

interface ChapterAudio {
  chapterId: string;
  title: string;
  order: number;
  audioPath: string;
  audioUrl?: string;
  durationSeconds: number;
}

async function stitchWithFfmpeg(
  inputPaths: string[],
  outputPath: string
): Promise<boolean> {
  if (inputPaths.length === 0) return false;

  if (inputPaths.length === 1) {
    await fs.copyFile(inputPaths[0], outputPath);
    return true;
  }

  const ffmpegBin = process.env.FFMPEG_BIN || "ffmpeg";
  const listPath = outputPath + ".txt";
  const listContent = inputPaths.map((p) => `file '${p}'`).join("\n");
  await fs.writeFile(listPath, listContent);

  return new Promise((resolve) => {
    const args = ["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-y", outputPath];
    const proc = spawn(ffmpegBin, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", async (code) => {
      await fs.unlink(listPath).catch(() => {});
      if (code === 0) {
        resolve(true);
      } else {
        console.warn("[audiobook worker] ffmpeg failed with code:", code, stderr.slice(-300));
        resolve(false);
      }
    });

    proc.on("error", async () => {
      await fs.unlink(listPath).catch(() => {});
      resolve(false);
    });
  });
}

function createManifest(chapters: ChapterAudio[], bookId: string): object {
  return {
    version: 1,
    bookId,
    chapters: chapters.map((ch) => ({
      id: ch.chapterId,
      title: ch.title,
      order: ch.order,
      audioUrl: ch.audioUrl,
      durationSeconds: ch.durationSeconds,
    })),
    totalDurationSeconds: chapters.reduce((sum, ch) => sum + ch.durationSeconds, 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Processing
// ─────────────────────────────────────────────────────────────────────────────

async function processJob(payload: AudiobookJobData) {
  const { jobId, bookId, bookVersionId, userId, language, voiceId, modelPath } = payload;
  const supabase = createAdminClient();

  // Helper to update ai_jobs
  const updateJob = async (
    status: string,
    outputUpdate: Record<string, unknown> = {},
    error?: string
  ) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };

    if (status === "processing" && !outputUpdate.started_at) {
      updates.started_at = now;
    }
    if (status === "completed" || status === "failed") {
      updates.finished_at = now;
    }
    if (error) {
      updates.error = error;
    }

    // Merge output updates
    const { data: current } = await supabase
      .from("ai_jobs")
      .select("output")
      .eq("id", jobId)
      .single();

    const currentOutput = (current?.output as Record<string, unknown>) ?? {};
    updates.output = { ...currentOutput, ...outputUpdate };

    await supabase.from("ai_jobs").update(updates).eq("id", jobId);
  };

  const updateBookStatus = async (status: string) => {
    await supabase.from("books").update({ audiobook_status: status }).eq("id", bookId);
  };

  try {
    console.log("[audiobook worker] job started -", jobId, "bookId:", bookId, "versionId:", bookVersionId);

    await updateJob("processing", { started_at: new Date().toISOString() });
    await updateBookStatus("generating");

    // Fetch chapters for this version, ordered by `order`
    const { data: chapters, error: chaptersError } = await supabase
      .from("chapters")
      .select("id, title, content, order")
      .eq("book_version_id", bookVersionId)
      .order("order", { ascending: true });

    if (chaptersError || !chapters?.length) {
      throw new Error(chaptersError?.message ?? "No chapters found for this version");
    }

    const totalChapters = chapters.length;
    await updateJob("processing", { totalChapters, completedChapters: 0 });

    // Create temp directory for this job
    const tmpDir = path.join(os.tmpdir(), "verkli-audiobook", jobId);
    await fs.mkdir(tmpDir, { recursive: true });

    const chapterAudios: ChapterAudio[] = [];

    // Process chapters sequentially
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const text = getChapterText(chapter.content);

      if (!text.trim()) {
        console.log(`[audiobook worker] chapter ${i} (${chapter.id}) empty, skipping`);
        continue;
      }

      await updateJob("processing", {
        completedChapters: i,
        currentChapterId: chapter.id,
        currentChapterTitle: chapter.title,
      });

      // Compute cache key
      const contentHash = computeContentHash(text, chapter.id, bookVersionId);

      // Check cache
      const { data: cached } = await supabase
        .from("chapter_audio_cache")
        .select("audio_path, duration_seconds")
        .eq("chapter_id", chapter.id)
        .eq("content_hash", contentHash)
        .eq("voice_id", voiceId)
        .eq("model_path", modelPath)
        .eq("language", language)
        .maybeSingle();

      let audioPath: string;
      let durationSeconds: number;
      let audioUrl: string | undefined;

      if (cached?.audio_path) {
        // Download cached audio from storage
        console.log(`[audiobook worker] chapter ${i} cache hit, downloading...`);
        const localPath = path.join(tmpDir, `chapter-${i}.wav`);
        const { data: audioData, error: downloadError } = await supabase.storage
          .from(BUCKET)
          .download(cached.audio_path);

        if (!downloadError && audioData) {
          const buffer = Buffer.from(await audioData.arrayBuffer());
          await fs.writeFile(localPath, buffer);
          audioPath = localPath;
          durationSeconds = cached.duration_seconds ?? estimateWavDuration(buffer);

          // Get public URL for manifest
          const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(cached.audio_path);
          audioUrl = urlData?.publicUrl;
        } else {
          // Cache miss/invalid, synthesize fresh
          console.log(`[audiobook worker] chapter ${i} cache invalid, synthesizing...`);
          const wav = await synthesizeTextToWavBytes(text);
          audioPath = path.join(tmpDir, `chapter-${i}.wav`);
          await fs.writeFile(audioPath, wav);
          durationSeconds = estimateWavDuration(wav);

          // Upload to cache
          const cachePath = `cache/${bookId}/${chapter.id}-${contentHash.slice(0, 16)}.wav`;
          await uploadAndCacheChapter(supabase, cachePath, wav, chapter.id, bookVersionId, contentHash, voiceId, modelPath, language, durationSeconds);

          const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(cachePath);
          audioUrl = urlData?.publicUrl;
        }
      } else {
        // No cache, synthesize new audio
        console.log(`[audiobook worker] chapter ${i} synthesizing: "${chapter.title}"`);
        const wav = await synthesizeTextToWavBytes(text);
        audioPath = path.join(tmpDir, `chapter-${i}.wav`);
        await fs.writeFile(audioPath, wav);
        durationSeconds = estimateWavDuration(wav);

        // Upload to cache
        const cachePath = `cache/${bookId}/${chapter.id}-${contentHash.slice(0, 16)}.wav`;
        await uploadAndCacheChapter(supabase, cachePath, wav, chapter.id, bookVersionId, contentHash, voiceId, modelPath, language, durationSeconds);

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(cachePath);
        audioUrl = urlData?.publicUrl;
      }

      chapterAudios.push({
        chapterId: chapter.id,
        title: chapter.title,
        order: chapter.order,
        audioPath,
        audioUrl,
        durationSeconds,
      });
    }

    await updateJob("processing", {
      completedChapters: totalChapters,
      currentChapterId: null,
      currentChapterTitle: null,
    });

    if (chapterAudios.length === 0) {
      throw new Error("No chapters with content to generate audio for");
    }

    // Try to stitch with ffmpeg
    const finalAudioPath = path.join(tmpDir, "audiobook-final.wav");
    const stitched = await stitchWithFfmpeg(
      chapterAudios.map((c) => c.audioPath),
      finalAudioPath
    );

    let finalAudioUrl: string | null = null;
    let manifestUrl: string | null = null;
    const totalDuration = chapterAudios.reduce((sum, c) => sum + c.durationSeconds, 0);
    let fileSizeBytes: number | null = null;

    if (stitched) {
      // Upload stitched audiobook
      const finalBuffer = await fs.readFile(finalAudioPath);
      fileSizeBytes = finalBuffer.length;
      const storagePath = `${bookId}/audiobook-${Date.now()}.wav`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, finalBuffer, {
          contentType: "audio/wav",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      finalAudioUrl = urlData?.publicUrl ?? null;

      console.log("[audiobook worker] uploaded stitched audiobook:", finalAudioUrl);
    } else {
      // Fallback: create manifest for chapter-wise playback
      console.log("[audiobook worker] ffmpeg unavailable, creating manifest instead");
      const manifest = createManifest(chapterAudios, bookId);
      const manifestPath = `${bookId}/audiobook-manifest-${Date.now()}.json`;

      const { error: manifestError } = await supabase.storage
        .from(BUCKET)
        .upload(manifestPath, JSON.stringify(manifest, null, 2), {
          contentType: "application/json",
          upsert: false,
        });

      if (manifestError) {
        console.warn("[audiobook worker] manifest upload failed:", manifestError.message);
      } else {
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(manifestPath);
        manifestUrl = urlData?.publicUrl ?? null;
      }
    }

    // Create audiobook_assets record
    await supabase.from("audiobook_assets").insert({
      book_id: bookId,
      language,
      status: "generated",
      audio_url: finalAudioUrl ?? manifestUrl,
      duration_seconds: totalDuration,
    });

    // Mark job complete
    await updateJob("completed", {
      audioUrl: finalAudioUrl,
      manifestUrl,
      durationSeconds: totalDuration,
      fileSizeBytes,
      chaptersProcessed: chapterAudios.length,
    });

    await updateBookStatus("ready");

    // Cleanup temp files
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    console.log(
      "[audiobook worker] completed -",
      jobId,
      "chapters:", chapterAudios.length,
      "duration:", totalDuration,
      "url:", finalAudioUrl ?? manifestUrl
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[audiobook worker] failed -", jobId, "error:", msg);

    await updateJob("failed", { errorDetails: msg }, msg);
    await updateBookStatus("failed");

    throw err;
  }
}

async function uploadAndCacheChapter(
  supabase: ReturnType<typeof createAdminClient>,
  storagePath: string,
  wav: Buffer,
  chapterId: string,
  bookVersionId: string,
  contentHash: string,
  voiceId: string,
  modelPath: string,
  language: string,
  durationSeconds: number
) {
  // Upload to storage
  await supabase.storage.from(BUCKET).upload(storagePath, wav, {
    contentType: "audio/wav",
    upsert: true,
  });

  // Insert cache record
  await supabase.from("chapter_audio_cache").upsert(
    {
      chapter_id: chapterId,
      book_version_id: bookVersionId,
      content_hash: contentHash,
      voice_id: voiceId,
      model_path: modelPath,
      language,
      audio_path: storagePath,
      duration_seconds: durationSeconds,
      file_size_bytes: wav.length,
    },
    { onConflict: "chapter_id,content_hash,voice_id,model_path,language" }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const url = process.env.REDIS_URL ?? "";
  if (!url || url.trim() === "") {
    console.error("[audiobook worker] REDIS_URL not set.");
    process.exit(1);
  }

  const connection = getRedisConnectionOptions();
  if (!connection) {
    console.error("[audiobook worker] Redis not reachable.");
    process.exit(1);
  }

  console.log("[audiobook worker] started - queue:", QUEUE_NAME);

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "generate" && job.data) {
        await processJob(job.data as AudiobookJobData);
      }
    },
    {
      connection: {
        host: connection.host,
        port: connection.port,
        password: connection.password,
      },
      concurrency: 1, // Sequential - TTS is CPU-bound
    }
  );

  worker.on("completed", (job) => {
    console.log("[audiobook worker] job completed:", job.id);
  });

  worker.on("failed", (job, err) => {
    console.error("[audiobook worker] job failed:", job?.id, err?.message);
  });

  worker.on("error", (err) => {
    console.error("[audiobook worker] error:", err.message);
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[audiobook worker] shutting down...");
    await worker.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[audiobook worker] shutting down...");
    await worker.close();
    process.exit(0);
  });
}

main();
