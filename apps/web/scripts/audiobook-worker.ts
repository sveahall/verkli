/**
 * BullMQ worker: process "generate" jobs for audiobook generation.
 * Run from apps/web: npm run audiobook-worker
 * Requires: REDIS_URL, Supabase env
 *
 * Uses ai_jobs table for job tracking (kind='audiobook_generation').
 * Progress stored in ai_jobs.output JSON field.
 */

import "./load-dotenv";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import * as crypto from "crypto";
import { existsSync } from "node:fs";
import { spawn } from "child_process";
import { fileURLToPath } from "node:url";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

assertServerEnv();

import { Worker, UnrecoverableError } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import { getAudiobookStorageBucket } from "../src/lib/tts/storage";
import { QUEUE_NAMES } from "../src/lib/queue-names";
import type { AudiobookJobData } from "../src/lib/audiobook-queue";
import { sanitizeJobErrorForStorage } from "../src/lib/sanitize-job-error";
import { isDuplicate } from "../src/lib/workers/idempotency";
import { checkBudget, BudgetExceededError } from "../src/lib/workers/budget";
import { getActiveProviderKey } from "../src/lib/tts/tts-provider";
import type { TtsProvider } from "../src/lib/tts/tts-provider";
import { OpenAiTtsProvider } from "../src/lib/tts/openai-tts-provider";

const QUEUE_NAME = QUEUE_NAMES.AUDIOBOOK;
const BUCKET = getAudiobookStorageBucket();
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..", "..");
const QWEN_MODEL_DEFAULT = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice";
const QWEN_SYNTH_SCRIPT_DEFAULT = path.join(SCRIPT_DIR, "qwen_tts_synthesize.py");
const QWEN_PYTHON_DEFAULT = path.join(REPO_ROOT, "qwen3tts-env", "bin", "python3.12");

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Max characters per Qwen chunk inside Python synthesizer. */
const QWEN_MAX_CHARS = (() => {
  const raw = process.env.TTS_MAX_CHARS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0 && n <= 20000) return Math.min(500, Math.floor(n));
  return 350;
})();

/** Max generated codec tokens for Qwen clone/custom calls. */
const QWEN_MAX_NEW_TOKENS = (() => {
  const raw = process.env.QWEN_TTS_MAX_NEW_TOKENS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.max(48, Math.min(4096, Math.floor(n)));
  return 2048;
})();

/** Chunk batch size used inside Python synth call. */
const QWEN_BATCH_SIZE = (() => {
  const raw = process.env.QWEN_TTS_BATCH_SIZE ?? process.env.TTS_BATCH_SIZE;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.max(1, Math.min(8, Math.floor(n)));
  return 1;
})();

/** Worker-level concurrency for audiobook jobs (default 1 to avoid VRAM thrash). */
const TTS_CONCURRENCY = (() => {
  const raw = process.env.TTS_CONCURRENCY;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.max(1, Math.min(4, Math.floor(n)));
  return 1;
})();

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

function perfNumber(value: number | undefined, digits = 2): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value.toFixed(digits);
}

function formatQwenPerf(result: QwenSynthesisResult): string {
  const parts: string[] = [];
  const metrics = result.metrics ?? undefined;
  const rtf = perfNumber(metrics?.rtf, 3);
  const genRtf = perfNumber(metrics?.generationRtf, 3);
  const wall = perfNumber(metrics?.wallClockSec, 2);
  const synth = perfNumber(metrics?.synthesisSec, 2);
  const cps = perfNumber(metrics?.charsPerSecGeneration, 1);
  const gpuMiB = perfNumber(metrics?.gpuPeakMemoryMiB, 0);

  if (wall) parts.push(`wall=${wall}s`);
  if (synth) parts.push(`synth=${synth}s`);
  if (rtf) parts.push(`rtf=${rtf}`);
  if (genRtf) parts.push(`genRtf=${genRtf}`);
  if (cps) parts.push(`chars/s=${cps}`);
  if (gpuMiB) parts.push(`gpuPeak=${gpuMiB}MiB`);
  if (result.batchSize) parts.push(`batch=${result.batchSize}`);
  if (result.dtype) parts.push(`dtype=${result.dtype}`);
  if (typeof result.torchCompile === "boolean") parts.push(`compile=${result.torchCompile ? "on" : "off"}`);
  if (typeof result.int8 === "boolean") parts.push(`int8=${result.int8 ? "on" : "off"}`);

  return parts.length > 0 ? `, ${parts.join(", ")}` : "";
}

function resolveQwenSynthScriptPath(): string {
  const configured = process.env.QWEN_TTS_SCRIPT?.trim();
  if (configured) return configured;
  return QWEN_SYNTH_SCRIPT_DEFAULT;
}

function resolveQwenPythonPath(): string {
  const configured = process.env.QWEN_TTS_PYTHON?.trim();
  if (configured) return configured;
  if (existsSync(QWEN_PYTHON_DEFAULT)) return QWEN_PYTHON_DEFAULT;
  return "python3.12";
}

type QwenSynthesisMetadata = {
  outputPath?: string;
  sampleRate?: number;
  device?: string;
  method?: string;
  batchSize?: number;
  dtype?: string;
  attnImplementation?: string;
  autocast?: boolean;
  torchCompile?: boolean;
  int8?: boolean;
  metrics?: {
    wallClockSec?: number;
    loadSec?: number;
    synthesisSec?: number;
    audioSec?: number;
    rtf?: number;
    generationRtf?: number;
    chars?: number;
    charsPerSecTotal?: number;
    charsPerSecGeneration?: number;
    gpuPeakMemoryMiB?: number;
    processedChunks?: number;
  };
};

type QwenSynthesisResult = {
  wav: Buffer;
  sampleRate: number;
  outputPath: string;
  device: string | null;
  method: string | null;
  metrics: QwenSynthesisMetadata["metrics"] | null;
  batchSize: number | null;
  dtype: string | null;
  torchCompile: boolean | null;
  int8: boolean | null;
};

function parseQwenMetadata(stdout: string): QwenSynthesisMetadata {
  const lines = stdout
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") {
        return parsed as QwenSynthesisMetadata;
      }
    } catch {
      // Keep scanning previous lines.
    }
  }

  throw new Error("Qwen synthesizer did not return valid JSON metadata.");
}

async function synthesizeWithQwen(
  text: string,
  outputPath: string,
  options: {
    language: string;
    voiceId: string;
    modelId: string;
    timeoutMs: number;
  }
): Promise<QwenSynthesisResult> {
  const pythonPath = resolveQwenPythonPath();
  const scriptPath = resolveQwenSynthScriptPath();

  if (!existsSync(scriptPath)) {
    throw new Error(
      `Qwen synth script missing: ${scriptPath}. Skapa filen apps/web/scripts/qwen_tts_synthesize.py.`
    );
  }

  const args = [
    scriptPath,
    "--output",
    outputPath,
    "--model-id",
    options.modelId || QWEN_MODEL_DEFAULT,
    "--language",
    options.language || "sv",
    "--speaker",
    options.voiceId || "Ryan",
    "--max-chars",
    String(QWEN_MAX_CHARS),
    "--batch-size",
    String(QWEN_BATCH_SIZE),
    "--max-new-tokens",
    String(QWEN_MAX_NEW_TOKENS),
    "--xvector-only",
    process.env.QWEN_TTS_XVECTOR_ONLY === "0" ? "0" : "1",
    "--clone-non-streaming-mode",
    process.env.QWEN_TTS_CLONE_NON_STREAMING_MODE === "1" ? "1" : "0",
  ];

  return new Promise<QwenSynthesisResult>((resolve, reject) => {
    const proc = spawn(pythonPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTORCH_ENABLE_MPS_FALLBACK: process.env.PYTORCH_ENABLE_MPS_FALLBACK ?? "1",
      },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      finish(() => {
        reject(
          new Error(
            `Qwen synth timed out after ${options.timeoutMs}ms. stderr: ${stderr.slice(-500)}`
          )
        );
      });
    }, Math.max(1, options.timeoutMs));

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (process.env.QWEN_TTS_VERBOSE === "1") {
        process.stderr.write(chunk.toString());
      }
    });

    proc.on("error", (error) => {
      finish(() => {
        reject(new Error(`Failed to start Qwen synth process (${pythonPath}): ${error.message}`));
      });
    });

    proc.on("close", (code) => {
      void (async () => {
        if (code !== 0) {
          finish(() => {
            reject(
              new Error(
                `Qwen synth exited with code ${code}. stderr: ${stderr.trim() || "(no stderr)"}`
              )
            );
          });
          return;
        }

        try {
          const metadata = parseQwenMetadata(stdout);
          const resolvedOutputPath = metadata.outputPath?.trim() || outputPath;
          const wav = await fs.readFile(resolvedOutputPath);
          finish(() => {
            resolve({
              wav,
              sampleRate:
                typeof metadata.sampleRate === "number" && Number.isFinite(metadata.sampleRate)
                  ? metadata.sampleRate
                  : 0,
              outputPath: resolvedOutputPath,
              device: typeof metadata.device === "string" ? metadata.device : null,
              method: typeof metadata.method === "string" ? metadata.method : null,
              metrics:
                metadata.metrics && typeof metadata.metrics === "object" ? metadata.metrics : null,
              batchSize:
                typeof metadata.batchSize === "number" && Number.isFinite(metadata.batchSize)
                  ? metadata.batchSize
                  : null,
              dtype: typeof metadata.dtype === "string" ? metadata.dtype : null,
              torchCompile:
                typeof metadata.torchCompile === "boolean" ? metadata.torchCompile : null,
              int8: typeof metadata.int8 === "boolean" ? metadata.int8 : null,
            });
          });
        } catch (error) {
          finish(() => {
            reject(error instanceof Error ? error : new Error(String(error)));
          });
        }
      })();
    });

    proc.stdin.end(text, "utf8");
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio Stitching
// ─────────────────────────────────────────────────────────────────────────────

interface ChapterAudio {
  chapterId: string;
  title: string;
  order: number;
  audioPath: string;
  storagePath: string;
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

function createManifest(chapters: ChapterAudio[], bookId: string): object {
  return {
    version: 1,
    bookId,
    chapters: chapters.map((ch) => ({
      id: ch.chapterId,
      title: ch.title,
      order: ch.order,
      audioPath: ch.storagePath,
      durationSeconds: ch.durationSeconds,
    })),
    totalDurationSeconds: chapters.reduce((sum, ch) => sum + ch.durationSeconds, 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Processing
// ─────────────────────────────────────────────────────────────────────────────

async function processJob(payload: AudiobookJobData) {
  const { jobId, bookId, bookVersionId, userId, language, voiceId, modelPath, chapterId, chapterIds } = payload;
  const supabase = createAdminClient();
  const resolvedModelId = modelPath?.trim() || QWEN_MODEL_DEFAULT;
  const selectedChapterIds = Array.from(
    new Set(
      (Array.isArray(chapterIds) ? chapterIds : [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
  if (selectedChapterIds.length === 0 && typeof chapterId === "string" && chapterId.trim().length > 0) {
    selectedChapterIds.push(chapterId.trim());
  }
  const singleChapterMode = selectedChapterIds.length === 1;
  const multiChapterMode = selectedChapterIds.length > 1;
  const selectedChapterId = singleChapterMode ? selectedChapterIds[0] : null;
  const scope: "book" | "chapter" | "chapters" = multiChapterMode
    ? "chapters"
    : singleChapterMode
      ? "chapter"
      : "book";

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
      .select("output, progress")
      .eq("id", jobId)
      .single();

    const currentOutput = (current?.output as Record<string, unknown>) ?? {};
    const nextOutput = { ...currentOutput, ...outputUpdate };
    updates.output = nextOutput;

    const totalChapters = Number(nextOutput.totalChapters ?? 0);
    const completedChapters = Number(nextOutput.completedChapters ?? 0);
    const currentProgress = Number(current?.progress ?? 0);

    if (status === "completed") {
      updates.progress = 100;
    } else if (totalChapters > 0) {
      const pct = Math.floor((completedChapters * 100) / totalChapters);
      updates.progress = Math.max(currentProgress, Math.min(99, Math.max(0, pct)));
    } else if (status === "pending") {
      updates.progress = 0;
    }

    await supabase.from("ai_jobs").update(updates).eq("id", jobId);
  };

  const updateBookStatus = async (status: string) => {
    await supabase.from("books").update({ audiobook_status: status }).eq("id", bookId);
  };

  const readControlFlags = async () => {
    const { data } = await supabase
      .from("ai_jobs")
      .select("output")
      .eq("id", jobId)
      .maybeSingle();
    const output = (data?.output as Record<string, unknown> | null) ?? {};
    return {
      pauseRequested: output.pauseRequested === true,
      cancelRequested: output.cancelRequested === true,
      controlState: typeof output.controlState === "string" ? output.controlState : null,
    };
  };

  const waitWhilePausedOrCancelled = async () => {
    let markedPaused = false;
    for (;;) {
      const flags = await readControlFlags();
      if (flags.cancelRequested) {
        throw new UnrecoverableError("AUDIOBOOK_CANCELLED");
      }
      if (!flags.pauseRequested) {
        if (markedPaused || flags.controlState === "paused" || flags.controlState === "pause_requested") {
          await updateJob("processing", {
            pauseRequested: false,
            cancelRequested: false,
            controlState: "running",
          });
        }
        return;
      }
      if (!markedPaused || flags.controlState !== "paused") {
        markedPaused = true;
        await updateJob("processing", {
          pauseRequested: true,
          cancelRequested: false,
          controlState: "paused",
        });
      }
      await sleep(1500);
    }
  };

  try {
    console.warn(
      "[audiobook worker] job started -",
      jobId,
      "bookId:",
      bookId,
      "versionId:",
      bookVersionId,
      "scope:",
      scope,
      selectedChapterId ? `chapterId: ${selectedChapterId}` : ""
    );

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

    if (scope === "book") {
      // Processor-level dedupe: skip if audiobook_assets already has a generated asset for this book+language
      const { data: existingGeneratedAsset } = await supabase
        .from("audiobook_assets")
        .select("id, audio_path, duration_seconds")
        .eq("book_id", bookId)
        .eq("language", language)
        .eq("status", "generated")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const alreadyDone = await isDuplicate(
        async () => Boolean(existingGeneratedAsset?.id),
        `audiobook:${bookId}:${language}`
      );

      if (alreadyDone) {
        await updateJob("completed", {
          skipped: true,
          reason: "dedupe",
          completedChapters: 0,
          currentChapterId: null,
          audioPath: existingGeneratedAsset?.audio_path ?? null,
          audioBucket: BUCKET,
          durationSeconds: existingGeneratedAsset?.duration_seconds ?? null,
          errorMessage: null,
          scope: "book",
          chapterId: null,
          chapterIds: null,
          pauseRequested: false,
          cancelRequested: false,
          controlState: "completed",
        });
        await updateBookStatus("published");
        return;
      }
    }

    await updateJob("processing", {
      started_at: new Date().toISOString(),
      errorMessage: null,
      scope,
      chapterId: selectedChapterId,
      chapterIds: selectedChapterIds.length > 0 ? selectedChapterIds : null,
      pauseRequested: false,
      cancelRequested: false,
      controlState: "running",
    });
    if (scope === "book") {
      await updateBookStatus("generating");
    }

    // Fetch chapters for this version, ordered by `order`
    const { data: allChapters, error: chaptersError } = await supabase
      .from("chapters")
      .select("id, title, content, order")
      .eq("book_version_id", bookVersionId)
      .order("order", { ascending: true });

    if (chaptersError || !allChapters?.length) {
      throw new Error(chaptersError?.message ?? "No chapters found for this version");
    }

    let chapters = allChapters;
    if (selectedChapterIds.length > 0) {
      const selectedSet = new Set(selectedChapterIds);
      chapters = allChapters.filter((chapter) => selectedSet.has(chapter.id));
      if (chapters.length !== selectedChapterIds.length) {
        const foundIds = new Set(chapters.map((chapter) => chapter.id));
        const missing = selectedChapterIds.filter((id) => !foundIds.has(id));
        throw new Error(`Requested chapter(s) not found for this version: ${missing.join(", ")}`);
      }
    }

    const totalChapters = chapters.length;
    const totalTextLength = chapters.reduce(
      (sum, ch) => sum + getChapterText(ch.content).length,
      0
    );
    const estimatedCostUnits = Math.ceil(totalTextLength / 4);
    try {
      await checkBudget({
        userId,
        pipeline: "tts",
        units: estimatedCostUnits,
        jobId,
      });
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }

    await updateJob("processing", {
      totalChapters,
      totalTextLength,
      completedChapters: 0,
      currentChapterId: null,
      currentChapterTitle: null,
      audioPath: null,
      audioBucket: null,
      manifestPath: null,
      manifestBucket: null,
      errorMessage: null,
      narratorModel: resolvedModelId,
      scope,
      chapterId: selectedChapterId,
      chapterIds: selectedChapterIds.length > 0 ? selectedChapterIds : null,
      pauseRequested: false,
      cancelRequested: false,
      controlState: "running",
    });

    // Create temp directory for this job
    const tmpDir = path.join(os.tmpdir(), "verkli-audiobook", jobId);
    await fs.mkdir(tmpDir, { recursive: true });

    const chapterAudios: ChapterAudio[] = [];
    const configuredTimeoutMs = Number(
      process.env.QWEN_TTS_TIMEOUT_MS ?? process.env.TTS_TIMEOUT_MS ?? 900_000
    );
    const chapterTimeoutMs =
      Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
        ? configuredTimeoutMs
        : 900_000;
    console.warn("[audiobook worker] qwen timeout per chapter:", chapterTimeoutMs, "ms");
    console.warn("[audiobook worker] qwen batch size:", QWEN_BATCH_SIZE);

    // Resolve TTS provider: "openai" for cloud, "qwen-local" for local subprocess
    const providerKey = getActiveProviderKey();
    let cloudProvider: TtsProvider | null = null;
    if (providerKey === "openai") {
      cloudProvider = new OpenAiTtsProvider();
      console.warn("[audiobook worker] using cloud TTS provider:", cloudProvider.name);
    }

    const synthesizeOne = async (text: string, outputPath: string) => {
      if (cloudProvider) {
        const result = await cloudProvider.synthesize(text, {
          language,
          voiceId,
          modelId: resolvedModelId,
          timeoutMs: chapterTimeoutMs,
        });
        await fs.writeFile(outputPath, result.wav);
        return {
          wav: result.wav,
          sampleRate: result.sampleRate,
          outputPath,
          device: "cloud",
          method: cloudProvider.name,
          metrics: result.metadata as QwenSynthesisMetadata["metrics"],
          batchSize: null,
          dtype: null,
          torchCompile: null,
          int8: null,
        } satisfies QwenSynthesisResult;
      }
      return synthesizeWithQwen(text, outputPath, {
        language,
        voiceId,
        modelId: resolvedModelId,
        timeoutMs: chapterTimeoutMs,
      });
    };

    // Process chapters sequentially
    for (let i = 0; i < chapters.length; i++) {
      await waitWhilePausedOrCancelled();
      const chapter = chapters[i];
      const text = getChapterText(chapter.content);

      if (!text.trim()) {
        console.warn(`[audiobook worker] chapter ${i} (${chapter.id}) empty, skipping`);
        continue;
      }

      await updateJob("processing", {
        completedChapters: chapterAudios.length,
        currentChapterId: chapter.id,
        currentChapterTitle: chapter.title,
        controlState: "running",
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
        .eq("model_path", resolvedModelId)
        .eq("language", language)
        .maybeSingle();

      let audioPath: string;
      let durationSeconds: number;
      let storagePath: string;

      if (cached?.audio_path) {
        // Download cached audio from storage
        console.warn(`[audiobook worker] chapter ${i} cache hit, downloading...`);
        const localPath = path.join(tmpDir, `chapter-${i}.wav`);
        const { data: audioData, error: downloadError } = await supabase.storage
          .from(BUCKET)
          .download(cached.audio_path);

        if (!downloadError && audioData) {
          const buffer = Buffer.from(await audioData.arrayBuffer());
          await fs.writeFile(localPath, buffer);
          audioPath = localPath;
          storagePath = cached.audio_path;
          durationSeconds = cached.duration_seconds ?? estimateWavDuration(buffer);
        } else {
          // Cache miss/invalid, synthesize fresh via local Qwen script.
          console.warn(`[audiobook worker] chapter ${i} cache invalid, synthesizing...`);
          const outputPath = path.join(tmpDir, `chapter-${i}.wav`);
          const synthesis = await synthesizeOne(text, outputPath);
          const { wav, device, method } = synthesis;
          durationSeconds = estimateWavDuration(wav);
          audioPath = synthesis.outputPath || outputPath;
          console.warn(
            `[audiobook worker] chapter ${i} synthesized via qwen (device=${device ?? "unknown"}, method=${method ?? "unknown"}${formatQwenPerf(synthesis)})`
          );

          // Upload to cache
          const cachePath = `cache/${bookId}/${chapter.id}-${contentHash.slice(0, 16)}.wav`;
          await uploadAndCacheChapter(supabase, cachePath, wav, chapter.id, bookVersionId, contentHash, voiceId, resolvedModelId, language, durationSeconds);
          storagePath = cachePath;
        }
      } else {
        // No cache, synthesize new audio via local Qwen script.
        console.warn(`[audiobook worker] chapter ${i} synthesizing via qwen: "${chapter.title}"`);
        const outputPath = path.join(tmpDir, `chapter-${i}.wav`);
        const synthesis = await synthesizeOne(text, outputPath);
        const { wav, device, method } = synthesis;
        durationSeconds = estimateWavDuration(wav);
        audioPath = synthesis.outputPath || outputPath;
        console.warn(
          `[audiobook worker] chapter ${i} synthesized via qwen (device=${device ?? "unknown"}, method=${method ?? "unknown"}${formatQwenPerf(synthesis)})`
        );

        // Upload to cache
        const cachePath = `cache/${bookId}/${chapter.id}-${contentHash.slice(0, 16)}.wav`;
        await uploadAndCacheChapter(supabase, cachePath, wav, chapter.id, bookVersionId, contentHash, voiceId, resolvedModelId, language, durationSeconds);
        storagePath = cachePath;
      }

      chapterAudios.push({
        chapterId: chapter.id,
        title: chapter.title,
        order: chapter.order,
        audioPath,
        storagePath,
        durationSeconds,
      });

      await waitWhilePausedOrCancelled();
      await updateJob("processing", {
        completedChapters: i + 1,
        currentChapterId: chapter.id,
        currentChapterTitle: chapter.title,
        controlState: "running",
      });
    }

    await updateJob("processing", {
      completedChapters: totalChapters,
      currentChapterId: null,
      currentChapterTitle: null,
      scope,
      chapterId: selectedChapterId,
      chapterIds: selectedChapterIds.length > 0 ? selectedChapterIds : null,
      pauseRequested: false,
      cancelRequested: false,
      controlState: "running",
    });

    if (chapterAudios.length === 0) {
      throw new Error("No chapters with content to generate audio for");
    }

    if (singleChapterMode) {
      const chapterResult = chapterAudios[0];
      await updateJob("completed", {
        audioPath: null,
        audioBucket: null,
        manifestPath: null,
        manifestBucket: null,
        generatedChapterAudioPath: chapterResult?.storagePath ?? null,
        generatedChapterAudioBucket: BUCKET,
        generatedChapterId: chapterResult?.chapterId ?? selectedChapterId,
        generatedChapterTitle: chapterResult?.title ?? null,
        durationSeconds: chapterResult?.durationSeconds ?? null,
        chaptersProcessed: chapterAudios.length,
        currentChapterId: null,
        currentChapterTitle: null,
        completedChapters: totalChapters,
        errorMessage: null,
        scope: "chapter",
        chapterId: selectedChapterId,
        chapterIds: selectedChapterIds,
        pauseRequested: false,
        cancelRequested: false,
        controlState: "completed",
      });

      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      return;
    }

    // Try to stitch with ffmpeg
    const finalAudioPath = path.join(tmpDir, "audiobook-final.wav");
    const stitched = await stitchWithFfmpeg(
      chapterAudios.map((c) => c.audioPath),
      finalAudioPath
    );

    let finalAudioStoragePath: string | null = null;
    let manifestStoragePath: string | null = null;
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
          finalAudioStoragePath = storagePath;
        } else {
          console.error("[audiobook worker] stitched upload failed", { bookId, error: uploadError.message });
        }
      } else {
        console.warn("[audiobook worker] stitched file too large, manifest-only", { bookId, sizeMb: Math.round(fileSizeBytes / 1024 / 1024) });
      }
    } else {
      console.warn("[audiobook worker] ffmpeg unavailable, manifest-only", { bookId });
    }

    // Always upload manifest so client can play by chapter (required when no single-file upload)
    const { error: manifestError } = await supabase.storage
      .from(BUCKET)
      .upload(manifestPath, JSON.stringify(manifest, null, 2), {
        contentType: "application/json",
        upsert: false,
      });

    if (manifestError) {
      console.error("[audiobook worker] manifest upload failed", { bookId, error: manifestError.message });
    } else {
      manifestStoragePath = manifestPath;
    }

    if (multiChapterMode) {
      await updateJob("completed", {
        audioPath: finalAudioStoragePath,
        audioBucket: BUCKET,
        manifestPath: manifestStoragePath,
        manifestBucket: BUCKET,
        durationSeconds: totalDuration,
        fileSizeBytes,
        chaptersProcessed: chapterAudios.length,
        currentChapterId: null,
        currentChapterTitle: null,
        completedChapters: totalChapters,
        errorMessage: null,
        scope: "chapters",
        chapterId: null,
        chapterIds: selectedChapterIds,
        pauseRequested: false,
        cancelRequested: false,
        controlState: "completed",
      });
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      return;
    }

    // Create audiobook_assets record with private storage path only.
    const assetPath = finalAudioStoragePath ?? manifestStoragePath;
    await supabase.from("audiobook_assets").insert({
      book_id: bookId,
      language,
      status: "generated",
      audio_path: assetPath,
      audio_bucket: BUCKET,
      duration_seconds: totalDuration,
    });

    // Mark job complete
    await updateJob("completed", {
      audioPath: finalAudioStoragePath,
      audioBucket: BUCKET,
      manifestPath: manifestStoragePath,
      manifestBucket: BUCKET,
      durationSeconds: totalDuration,
      fileSizeBytes,
      chaptersProcessed: chapterAudios.length,
      currentChapterId: null,
      currentChapterTitle: null,
      completedChapters: totalChapters,
      errorMessage: null,
      scope: "book",
      chapterId: null,
      chapterIds: null,
      pauseRequested: false,
      cancelRequested: false,
      controlState: "completed",
    });

    await updateBookStatus("published");

    // Cleanup temp files
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    console.warn(
      "[audiobook worker] completed -",
      jobId,
      "chapters:", chapterAudios.length,
      "duration:", totalDuration,
      "path:", finalAudioStoragePath ?? manifestStoragePath
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isCancelled = msg.includes("AUDIOBOOK_CANCELLED");
    const safeError = isCancelled
      ? "Generation cancelled."
      : sanitizeJobErrorForStorage(msg) ?? "Något gick fel. Kontakta support om problemet kvarstår.";
    console.error("[audiobook worker] failed -", jobId, "error:", msg);

    await updateJob(
      "failed",
      {
        errorDetails: safeError,
        errorMessage: safeError,
        currentChapterId: null,
        currentChapterTitle: null,
        scope,
        chapterId: selectedChapterId,
        chapterIds: selectedChapterIds.length > 0 ? selectedChapterIds : null,
        pauseRequested: false,
        cancelRequested: false,
        controlState: isCancelled ? "cancelled" : "failed",
      },
      isCancelled ? safeError : msg
    );
    if (scope === "book") {
      await updateBookStatus("failed");
    }

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

  console.warn(
    "[audiobook worker] started - queue:",
    QUEUE_NAME,
    "workerConcurrency:",
    TTS_CONCURRENCY
  );

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
      concurrency: TTS_CONCURRENCY,
      stalledInterval: 120_000,
      lockDuration: 3_660_000,
      maxStalledCount: 2,
    }
  );

  worker.on("completed", (job) => {
    console.warn("[audiobook worker] job completed:", job.id);
  });

  worker.on("failed", (job, err) => {
    console.error("[audiobook worker] job failed:", job?.id, err?.message);
  });

  worker.on("error", (err) => {
    console.error("[audiobook worker] error:", err.message);
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.warn("[audiobook worker] shutting down...");
    await worker.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.warn("[audiobook worker] shutting down...");
    await worker.close();
    process.exit(0);
  });
}

main();
