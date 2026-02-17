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

import { Worker, UnrecoverableError } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import { synthesizeTextToWavBytes } from "../src/lib/tts/piper";
import { getAudiobookStorageBucket } from "../src/lib/tts/storage";
import { QUEUE_NAMES } from "../src/lib/queue-names";
import type { AudiobookJobData } from "../src/lib/audiobook-queue";
import { getNarrator } from "../src/lib/ai/providers/workers";
import { sanitizeJobErrorForStorage } from "../src/lib/sanitize-job-error";
import { isDuplicate } from "../src/lib/workers/idempotency";
import { checkBudget, trackUsage, BudgetExceededError } from "../src/lib/workers/budget";
import { withTimeout } from "../src/lib/workers/timeout";

const QUEUE_NAME = QUEUE_NAMES.AUDIOBOOK;
const BUCKET = getAudiobookStorageBucket();

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

/** Max characters per TTS call (Piper default). Env TTS_MAX_CHARS can increase up to 20000. */
const TTS_MAX_CHARS = (() => {
  const raw = process.env.TTS_MAX_CHARS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0 && n <= 20000) return Math.floor(n);
  return 1000;
})();

/**
 * Split text into chunks of at most TTS_MAX_CHARS, preferring sentence/paragraph boundaries.
 */
function chunkTextForTts(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= TTS_MAX_CHARS) return [trimmed];

  const chunks: string[] = [];
  let rest = trimmed;

  while (rest.length > 0) {
    if (rest.length <= TTS_MAX_CHARS) {
      chunks.push(rest);
      break;
    }
    const segment = rest.slice(0, TTS_MAX_CHARS);
    const lastSentence = segment.match(/.*[.!?\n](?=\s|$)/s);
    const sentenceBoundary = lastSentence ? lastSentence[0].length : -1;
    const fallbackBoundary = Math.max(
      segment.lastIndexOf(". "),
      segment.lastIndexOf("! "),
      segment.lastIndexOf("? "),
      segment.lastIndexOf("\n")
    );

    let cut =
      sentenceBoundary > 0
        ? sentenceBoundary
        : fallbackBoundary > 0
          ? fallbackBoundary + 1
          : TTS_MAX_CHARS;

    // Guardrail: never exceed TTS max and always make forward progress.
    cut = Math.min(Math.max(cut, 1), TTS_MAX_CHARS);
    const chunk = rest.slice(0, cut).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
      rest = rest.slice(cut).trim();
      continue;
    }

    // Fallback when the cut lands on whitespace-only segment.
    cut = Math.min(TTS_MAX_CHARS, rest.length);
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }

  return chunks.filter((c) => c.length > 0);
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

/**
 * Concatenate WAV buffers (same format). Uses first file's header and appends PCM from all.
 * Safe fallback when ffmpeg is not available.
 */
function concatWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) throw new Error("No WAV buffers to concat");
  if (buffers.length === 1) return buffers[0];

  const header = buffers[0].slice(0, 44);
  const pcmChunks = buffers.map((b) => (b.length > 44 ? b.slice(44) : Buffer.alloc(0)));
  const pcm = Buffer.concat(pcmChunks);
  const out = Buffer.alloc(44 + pcm.length);
  header.copy(out, 0);
  pcm.copy(out, 44);
  // Update size in RIFF header (bytes 4–7) and data chunk size (bytes 40–43), little-endian
  out.writeUInt32LE(out.length - 8, 4);
  out.writeUInt32LE(pcm.length, 40);
  return out;
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
  const listContent = inputPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
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
        console.warn(
          "[audiobook worker] ffmpeg failed with code:",
          code,
          "(install with: brew install ffmpeg). stderr:",
          stderr.slice(-400)
        );
        resolve(false);
      }
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      console.warn(
        "[audiobook worker] ffmpeg spawn error:",
        err.code ?? err.message,
        "- is ffmpeg installed? (brew install ffmpeg)"
      );
      fs.unlink(listPath).catch(() => {});
      resolve(false);
    });
  });
}

/**
 * Synthesize text that may exceed TTS max length by chunking, then stitch WAVs.
 * Uses chunkTextForTts and stitchWithFfmpeg.
 */
async function synthesizeLongTextToWav(
  synthesize: (text: string) => Promise<Buffer>,
  text: string,
  tmpDir: string,
  filePrefix: string
): Promise<{ wav: Buffer; durationSeconds: number }> {
  const chunks = chunkTextForTts(text);
  if (chunks.length === 0) throw new Error("No text to synthesize");
  if (chunks.length === 1) {
    const wav = await synthesize(chunks[0]);
    return { wav, durationSeconds: estimateWavDuration(wav) };
  }
  const chunkPaths: string[] = [];
  let totalDuration = 0;
  for (let i = 0; i < chunks.length; i++) {
    const wav = await synthesize(chunks[i]);
    totalDuration += estimateWavDuration(wav);
    const p = path.join(tmpDir, `${filePrefix}-${i}.wav`);
    await fs.writeFile(p, wav);
    chunkPaths.push(p);
  }
  const stitchedPath = path.join(tmpDir, `${filePrefix}-stitched.wav`);
  const ok = await stitchWithFfmpeg(chunkPaths, stitchedPath);
  let wav: Buffer;
  if (ok) {
    wav = await fs.readFile(stitchedPath);
  } else {
    // Fallback: concat WAVs in Node (no ffmpeg needed)
    const buffers = await Promise.all(chunkPaths.map((p) => fs.readFile(p)));
    wav = concatWavBuffers(buffers);
    await fs.writeFile(stitchedPath, wav);
  }
  return { wav, durationSeconds: estimateWavDuration(wav) };
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
      updates.error = sanitizeJobErrorForStorage(error);
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

    // Auth isolation: verify userId matches book owner
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("author_id")
      .eq("id", bookId)
      .single();

    if (bookError || !book) {
      throw new Error(bookError?.message ?? "Book not found");
    }

    if (book.author_id !== userId) {
      const errMsg = "Ownership mismatch: userId does not match book owner";
      console.error("[audiobook worker]", errMsg, "payload userId:", userId, "book author_id:", book.author_id);
      throw new UnrecoverableError(errMsg);
    }

    // Processor-level dedupe: skip if audiobook_assets already has a generated asset for this book+language
    const alreadyDone = await isDuplicate(async () => {
      const { data: existingAsset } = await supabase
        .from("audiobook_assets")
        .select("id")
        .eq("book_id", bookId)
        .eq("language", language)
        .eq("status", "generated")
        .maybeSingle();
      return !!existingAsset;
    }, `audiobook:${bookId}:${language}`);

    if (alreadyDone) {
      await updateJob("completed", { skipped: true, reason: "dedupe" });
      return;
    }

    // Budget gate: check token budget before TTS
    const budgetKey = userId;
    try {
      checkBudget(budgetKey);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        console.warn("[audiobook worker] budget exceeded for:", budgetKey);
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }

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

      const TTS_TIMEOUT_MS = 300_000; // 5 minutes per chapter

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
          // Cache miss/invalid, synthesize fresh (chunked if text > TTS_MAX_CHARS)
          console.log(`[audiobook worker] chapter ${i} cache invalid, synthesizing...`);
          const { wav, durationSeconds: dur } = await withTimeout(
            () =>
              synthesizeLongTextToWav(
                (t) => synthesizeTextToWavBytes(t),
                text,
                tmpDir,
                `chapter-${i}`
              ),
            TTS_TIMEOUT_MS,
            `TTS chapter ${i}`
          );
          durationSeconds = dur;
          audioPath = path.join(tmpDir, `chapter-${i}.wav`);
          await fs.writeFile(audioPath, wav);

          // Upload to cache
          const cachePath = `cache/${bookId}/${chapter.id}-${contentHash.slice(0, 16)}.wav`;
          await uploadAndCacheChapter(supabase, cachePath, wav, chapter.id, bookVersionId, contentHash, voiceId, modelPath, language, durationSeconds);

          const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(cachePath);
          audioUrl = urlData?.publicUrl;
        }
      } else {
        // No cache, synthesize new audio via provider registry (chunked if text > TTS_MAX_CHARS)
        console.log(`[audiobook worker] chapter ${i} synthesizing via provider: "${chapter.title}"`);
        const narrator = getNarrator();
        const synthesizeOne = (t: string) =>
          narrator.narrate({ text: t }).then((r) => r.audioBuffer);
        const { wav, durationSeconds: dur } = await withTimeout(
          () => synthesizeLongTextToWav(synthesizeOne, text, tmpDir, `chapter-${i}`),
          TTS_TIMEOUT_MS,
          `TTS chapter ${i}`
        );
        durationSeconds = dur;
        audioPath = path.join(tmpDir, `chapter-${i}.wav`);
        await fs.writeFile(audioPath, wav);

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

    // Track TTS usage (estimate: ~1 token per 4 chars of synthesized text)
    const totalChars = chapters.reduce(
      (sum, ch) => sum + getChapterText(ch.content).length,
      0
    );
    const estimatedTokens = Math.ceil(totalChars / 4);
    trackUsage(userId, estimatedTokens);

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

    // Supabase Storage file size limit (e.g. 50 MB free tier). Larger books use manifest-only.
    const MAX_STORAGE_FILE_BYTES = 50 * 1024 * 1024;

    const manifest = createManifest(chapterAudios, bookId);
    const manifestPath = `${bookId}/audiobook-manifest-${Date.now()}.json`;

    if (stitched) {
      const finalBuffer = await fs.readFile(finalAudioPath);
      fileSizeBytes = finalBuffer.length;

      if (fileSizeBytes <= MAX_STORAGE_FILE_BYTES) {
        const storagePath = `${bookId}/audiobook-${Date.now()}.wav`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, finalBuffer, {
            contentType: "audio/wav",
            upsert: false,
          });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
          finalAudioUrl = urlData?.publicUrl ?? null;
          console.log("[audiobook worker] uploaded stitched audiobook:", finalAudioUrl);
        }
      } else {
        console.log(
          "[audiobook worker] stitched file too large (",
          Math.round(fileSizeBytes / 1024 / 1024),
          "MB), using manifest-only playback"
        );
      }
    } else {
      console.log("[audiobook worker] ffmpeg unavailable, using manifest-only playback");
    }

    // Always upload manifest so client can play by chapter (required when no single-file upload)
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

    await updateBookStatus("published");

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
    const safeError = sanitizeJobErrorForStorage(msg) ?? "Något gick fel. Kontakta support om problemet kvarstår.";
    console.error("[audiobook worker] failed -", jobId, "error:", msg);

    await updateJob("failed", { errorDetails: safeError }, msg);
    await updateBookStatus("failed");

    // Cleanup temp files on failure too
    const tmpDir = path.join(os.tmpdir(), "verkli-audiobook", jobId);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

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
      concurrency: 2,
      stalledInterval: 120_000,
      lockDuration: 600_000,
      maxStalledCount: 2,
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
