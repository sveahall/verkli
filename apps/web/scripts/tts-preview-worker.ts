/**
 * TTS Preview Lab worker: polls tts_preview_jobs, runs Qwen TTS, uploads to storage.
 * Run from apps/web: npm run tts-preview-worker
 *
 * Requires: Supabase env, QWEN_TTS_PYTHON, QWEN_TTS_SCRIPT (optional)
 * No Redis – polls DB directly.
 */

import "./load-dotenv";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "node:url";
import { assertServerEnv } from "../src/lib/env";

assertServerEnv();

import { createAdminClient } from "../src/lib/supabase/admin";
import { sanitizeJobErrorForStorage } from "../src/lib/sanitize-job-error";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..", "..");
const QWEN_MODEL_DEFAULT = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice";
const QWEN_SYNTH_SCRIPT_DEFAULT = path.join(SCRIPT_DIR, "qwen_tts_synthesize.py");
const QWEN_VOICE_PROFILES_DEFAULT = path.join(SCRIPT_DIR, "tts-voice-profiles.json");
const QWEN_PYTHON_DEFAULT = path.join(REPO_ROOT, "qwen3tts-env", "bin", "python3.12");
const QWEN_PYTHON_FALLBACKS = ["python3.12", "python3.11", "python3"];
const TTS_PREVIEW_BUCKET = "tts_previews";
const POLL_INTERVAL_MS = 2000;
const STALE_MINUTES = 3;
const DEBUG = process.env.TTS_LAB_DEBUG === "1";
const VERBOSE_QWEN_LOGS = process.env.QWEN_TTS_VERBOSE === "1";
let cachedQwenPythonPath: string | null = null;
let cachedFfmpegPath: string | null = null;

const VIDEO_REFERENCE_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".mkv",
  ".avi",
  ".mpeg",
  ".mpg",
]);

function parseTimeoutMs(): number {
  const raw = process.env.QWEN_TTS_TIMEOUT_MS ?? process.env.TTS_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 120_000;
  return Math.floor(parsed);
}

function parseMaxNewTokens(): number {
  const raw = process.env.QWEN_TTS_MAX_NEW_TOKENS ?? process.env.TTS_MAX_NEW_TOKENS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 512;
  return Math.floor(parsed);
}

const SYNTH_TIMEOUT_MS = parseTimeoutMs();
const QWEN_MAX_NEW_TOKENS = parseMaxNewTokens();

type VoiceJobPayload = {
  speaker?: string;
  profile?: string;
  prompt?: string;
  instruct?: string;
  refText?: string;
  refAudioPath?: string;
};

type VoiceProfile = {
  speaker?: string;
  refAudio?: string;
  refText?: string;
  prompt?: string;
};

type ResolvedVoiceConfig = {
  speaker: string;
  refAudio: string | null;
  refText: string | null;
  instruct: string | null;
};

const SUPPORTED_SPEAKERS = new Set([
  "aiden",
  "dylan",
  "eric",
  "ono_anna",
  "ryan",
  "serena",
  "sohee",
  "uncle_fu",
  "vivian",
]);

const LEGACY_SPEAKER_ALIASES: Record<string, string> = {
  ryan: "ryan",
  samantha: "serena",
  alex: "aiden",
  alloy: "eric",
  echo: "dylan",
  fable: "vivian",
  onyx: "uncle_fu",
  nova: "ono_anna",
  shimmer: "sohee",
};

function log(msg: string, ...args: unknown[]) {
  if (DEBUG || process.env.NODE_ENV !== "test") {
    console.log(`[tts-preview worker] ${msg}`, ...args);
  }
}

function resolveQwenSynthScriptPath(): string {
  const configured = process.env.QWEN_TTS_SCRIPT?.trim();
  if (configured) return configured;
  return QWEN_SYNTH_SCRIPT_DEFAULT;
}

function resolveVoiceProfilesPath(): string {
  const configured = process.env.QWEN_TTS_VOICE_PROFILES?.trim();
  if (!configured) return QWEN_VOICE_PROFILES_DEFAULT;
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(APP_ROOT, configured);
}

function decodeVoiceJobPayload(rawVoiceId: string): VoiceJobPayload {
  if (!rawVoiceId.startsWith("json:")) {
    return { speaker: rawVoiceId };
  }

  try {
    const parsed = JSON.parse(rawVoiceId.slice(5)) as VoiceJobPayload;
    if (!parsed || typeof parsed !== "object") {
      return { speaker: rawVoiceId };
    }
    return parsed;
  } catch {
    return { speaker: rawVoiceId };
  }
}

function sanitizeOptional(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLen) return null;
  return trimmed;
}

function normalizeSpeakerId(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  const aliased = LEGACY_SPEAKER_ALIASES[normalized] ?? normalized;
  if (SUPPORTED_SPEAKERS.has(aliased)) return aliased;
  log("unsupported speaker id, fallback to ryan", { raw, normalized, aliased });
  return "ryan";
}

async function loadVoiceProfiles(): Promise<Record<string, VoiceProfile>> {
  const filePath = resolveVoiceProfilesPath();
  if (!existsSync(filePath)) return {};
  const raw = await fs.readFile(filePath, "utf8");
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as Record<string, VoiceProfile>;
  if (!parsed || typeof parsed !== "object") return {};
  return parsed;
}

async function resolveVoiceConfig(rawVoiceId: string): Promise<ResolvedVoiceConfig> {
  const payload = decodeVoiceJobPayload(rawVoiceId);
  const speaker = sanitizeOptional(payload.speaker, 64) ?? "Ryan";
  const profileName = sanitizeOptional(payload.profile, 64);
  const payloadPrompt = sanitizeOptional(payload.prompt, 240);
  const payloadInstruct = sanitizeOptional(payload.instruct, 240);
  const payloadRefText = sanitizeOptional(payload.refText, 500);
  const payloadRefAudioPath = sanitizeOptional(payload.refAudioPath, 512);
  let profile: VoiceProfile | null = null;

  if (profileName) {
    const profiles = await loadVoiceProfiles();
    profile = profiles[profileName] ?? null;
    if (!profile) {
      throw new Error(`[tts preview] voice profile not found: ${profileName}`);
    }
  }

  const profileSpeaker = sanitizeOptional(profile?.speaker, 64);
  const profileRefAudio = sanitizeOptional(profile?.refAudio, 512);
  const profileRefText = sanitizeOptional(profile?.refText, 500);
  const profilePrompt = sanitizeOptional(profile?.prompt, 240);
  const resolvedRefAudio = payloadRefAudioPath ?? profileRefAudio;
  const resolvedInstruct = payloadInstruct ?? payloadPrompt ?? profilePrompt;
  const resolvedRefText = resolvedRefAudio ? payloadRefText ?? profileRefText : null;

  return {
    speaker: normalizeSpeakerId(profileSpeaker ?? speaker),
    refAudio: resolvedRefAudio,
    refText: resolvedRefText,
    instruct: resolvedInstruct,
  };
}

function resolveQwenPythonPath(): string {
  if (cachedQwenPythonPath) return cachedQwenPythonPath;

  const configured = process.env.QWEN_TTS_PYTHON?.trim();
  const candidates = [configured, QWEN_PYTHON_DEFAULT, ...QWEN_PYTHON_FALLBACKS].filter(
    (value): value is string => Boolean(value)
  );

  for (const candidate of candidates) {
    const looksLikePath =
      candidate.includes("/") || candidate.includes("\\") || candidate.startsWith(".");

    if (looksLikePath && !existsSync(candidate)) {
      log(`python candidate missing, skipping: ${candidate}`);
      continue;
    }

    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (probe.status === 0) {
      cachedQwenPythonPath = candidate;
      if (configured && configured !== candidate) {
        log(`configured QWEN_TTS_PYTHON unusable, using fallback: ${candidate}`);
      }
      return candidate;
    }

    log(`python candidate unavailable, skipping: ${candidate}`);
  }

  throw new Error(
    "No usable Python runtime for Qwen TTS. Set QWEN_TTS_PYTHON to a valid executable path (for example /usr/local/bin/python3.12)."
  );
}

function resolveFfmpegPath(): string | null {
  if (cachedFfmpegPath) return cachedFfmpegPath;
  const configured = process.env.QWEN_TTS_FFMPEG?.trim();
  const candidates = [configured, "ffmpeg", "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"].filter(
    (value): value is string => Boolean(value)
  );

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-version"], { stdio: "ignore" });
    if (probe.status === 0) {
      cachedFfmpegPath = candidate;
      return candidate;
    }
  }
  return null;
}

function maybeExtractAudioFromVideo(referencePath: string, tmpDir: string): string {
  const ext = path.extname(referencePath).toLowerCase();
  if (!VIDEO_REFERENCE_EXTENSIONS.has(ext)) return referencePath;

  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    throw new Error(
      `[tts preview] ffmpeg missing; cannot extract audio from video reference (${path.basename(referencePath)}). Install ffmpeg or upload audio file.`
    );
  }

  const outputPath = path.join(tmpDir, "ref-audio-extracted.wav");
  const result = spawnSync(
    ffmpegPath,
    ["-y", "-i", referencePath, "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", outputPath],
    { stdio: "pipe" }
  );
  if (result.status !== 0 || !existsSync(outputPath)) {
    const stderr = result.stderr?.toString().slice(-400) ?? "(no stderr)";
    throw new Error(`[tts preview] ffmpeg audio extraction failed for ${path.basename(referencePath)}: ${stderr}`);
  }

  log("extracted audio from video reference", { input: path.basename(referencePath) });
  return outputPath;
}

function parseQwenMetadata(stdout: string): { outputPath?: string } {
  const lines = stdout
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]!.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(lines[i]!) as { outputPath?: string };
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* skip */
    }
  }
  throw new Error("Qwen synthesizer did not return valid JSON metadata.");
}

async function materializeRefAudio(
  admin: ReturnType<typeof createAdminClient>,
  refAudio: string | null,
  tmpDir: string
): Promise<string | null> {
  if (!refAudio) return null;

  // Voice profiles created via script store absolute local paths.
  if (existsSync(refAudio)) {
    return refAudio;
  }

  // UI uploads store object keys in tts_previews bucket, e.g. refs/<user>/<file>.
  const { data, error } = await admin.storage.from(TTS_PREVIEW_BUCKET).download(refAudio);
  if (error) {
    throw new Error(`[tts preview] reference audio download failed (${refAudio}): ${error.message}`);
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  const ext = path.extname(refAudio) || ".wav";
  const localPath = path.join(tmpDir, `ref-audio${ext}`);
  await fs.writeFile(localPath, bytes);
  return localPath;
}

async function synthesizeWithQwen(
  text: string,
  outputPath: string,
  voiceConfig: ResolvedVoiceConfig
): Promise<Buffer> {
  const pythonPath = resolveQwenPythonPath();
  const scriptPath = resolveQwenSynthScriptPath();

  if (!existsSync(scriptPath)) {
    throw new Error(`Qwen synth script missing: ${scriptPath}`);
  }

  const args = [
    scriptPath,
    "--output",
    outputPath,
    "--model-id",
    process.env.QWEN_TTS_MODEL_ID || QWEN_MODEL_DEFAULT,
    "--language",
    "auto",
    "--speaker",
    voiceConfig.speaker,
    "--max-chars",
    "500",
    "--batch-size",
    "1",
    "--max-new-tokens",
    String(QWEN_MAX_NEW_TOKENS),
    "--xvector-only",
    voiceConfig.refText ? "0" : process.env.QWEN_TTS_XVECTOR_ONLY === "0" ? "0" : "1",
    "--clone-non-streaming-mode",
    process.env.QWEN_TTS_CLONE_NON_STREAMING_MODE === "1" ? "1" : "0",
  ];
  if (voiceConfig.refAudio) {
    args.push("--ref-audio", voiceConfig.refAudio);
  }
  if (voiceConfig.refText) {
    args.push("--ref-text", voiceConfig.refText);
  }
  if (voiceConfig.instruct) {
    args.push("--instruct", voiceConfig.instruct);
  }

  return new Promise<Buffer>((resolve, reject) => {
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
        reject(new Error(`Qwen synth timed out after ${SYNTH_TIMEOUT_MS}ms. stderr: ${stderr.slice(-500)}`));
      });
    }, SYNTH_TIMEOUT_MS);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (VERBOSE_QWEN_LOGS) {
        process.stderr.write(text);
      }
    });

    proc.on("error", (err) => {
      finish(() => reject(new Error(`Failed to start Qwen synth (${pythonPath}): ${err.message}`)));
    });

    proc.on("close", (code) => {
      void (async () => {
        if (code !== 0) {
          finish(() =>
            reject(new Error(`Qwen synth exited with code ${code}. stderr: ${stderr.trim() || "(no stderr)"}`))
          );
          return;
        }
        try {
          const metadata = parseQwenMetadata(stdout);
          const resolvedPath = metadata.outputPath?.trim() || outputPath;
          const wav = await fs.readFile(resolvedPath);
          finish(() => resolve(wav));
        } catch (e) {
          finish(() => reject(e instanceof Error ? e : new Error(String(e))));
        }
      })();
    });

    proc.stdin.end(text, "utf8");
  });
}

async function processJob(
  admin: ReturnType<typeof createAdminClient>,
  job: {
    id: string;
    user_id: string;
    text: string;
    voice_id: string;
    format: string;
  }
): Promise<void> {
  const tmpDir = path.join(os.tmpdir(), `tts-preview-${job.id}`);
  await fs.mkdir(tmpDir, { recursive: true });
  let heartbeatProgress = 10;
  const heartbeat = setInterval(() => {
    heartbeatProgress = Math.min(95, heartbeatProgress + 2);
    void admin
      .from("tts_preview_jobs")
      .update({
        progress: heartbeatProgress,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "running")
      .then(({ error }) => {
        if (error) log("heartbeat update failed", job.id, error.message);
      });
  }, 10_000);

  try {
    const outputPath = path.join(tmpDir, "output.wav");
    const voiceConfig = await resolveVoiceConfig(job.voice_id);
    const resolvedRefAudioPath = await materializeRefAudio(admin, voiceConfig.refAudio, tmpDir);
    const preparedRefAudioPath = resolvedRefAudioPath
      ? maybeExtractAudioFromVideo(resolvedRefAudioPath, tmpDir)
      : null;
    const effectiveVoiceConfig: ResolvedVoiceConfig = {
      ...voiceConfig,
      refAudio: preparedRefAudioPath,
      refText: preparedRefAudioPath ? voiceConfig.refText : null,
    };
    log("voice config resolved", {
      jobId: job.id,
      speaker: effectiveVoiceConfig.speaker,
      hasRefAudio: Boolean(effectiveVoiceConfig.refAudio),
      hasRefText: Boolean(effectiveVoiceConfig.refText),
      hasInstruct: Boolean(effectiveVoiceConfig.instruct),
    });
    const wav = await synthesizeWithQwen(job.text, outputPath, effectiveVoiceConfig);

    const storagePath = `${job.user_id}/${job.id}.wav`;
    const { error: uploadError } = await admin.storage
      .from(TTS_PREVIEW_BUCKET)
      .upload(storagePath, wav, {
        contentType: "audio/wav",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { error: updateError } = await admin
      .from("tts_preview_jobs")
      .update({
        status: "succeeded",
        progress: 100,
        audio_path: storagePath,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (updateError) {
      log("update succeeded failed", job.id, updateError.message);
    }
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const sanitized = sanitizeJobErrorForStorage(rawMessage);

    await admin
      .from("tts_preview_jobs")
      .update({
        status: "failed",
        error: sanitized,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    log("job failed", job.id, rawMessage);
  } finally {
    clearInterval(heartbeat);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function reapStaleRunning(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();
  const { data: stale, error } = await admin
    .from("tts_preview_jobs")
    .select("id")
    .eq("status", "running")
    .lt("updated_at", cutoff);

  if (error || !stale?.length) return 0;

  for (const row of stale) {
    await admin
      .from("tts_preview_jobs")
      .update({ status: "failed", error: "WORKER_STALE", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    log("reaped stale", row.id);
  }
  return stale.length;
}

async function pollAndProcess(): Promise<boolean> {
  const admin = createAdminClient();

  await reapStaleRunning(admin);

  const { data: jobs, error } = await admin
    .from("tts_preview_jobs")
    .select("id, user_id, text, voice_id, format")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    log("poll error", error.message);
    return false;
  }

  if (!jobs || jobs.length === 0) {
    return false;
  }

  const job = jobs[0] as { id: string; user_id: string; text: string; voice_id: string; format: string };

  const { data: claimed, error: claimError } = await admin
    .from("tts_preview_jobs")
    .update({ status: "running", progress: 10, updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id, status")
    .maybeSingle();

  if (claimError || !claimed || (claimed as { status?: string }).status !== "running") {
    log("claim failed or lost race", job.id, claimError?.message ?? "no row");
    return false;
  }

  log("processing", job.id);
  await processJob(admin, job);
  return true;
}

async function main(): Promise<void> {
  log("starting – polling tts_preview_jobs (queued)", {
    synthTimeoutMs: SYNTH_TIMEOUT_MS,
    maxNewTokens: QWEN_MAX_NEW_TOKENS,
    verboseQwenLogs: VERBOSE_QWEN_LOGS,
  });

  const shutdown = async () => {
    log("shutting down");
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (true) {
    try {
      const didWork = await pollAndProcess();
      if (!didWork) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    } catch (err) {
      log("loop error", err);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

main().catch((err) => {
  console.error("[tts-preview worker] fatal:", err);
  process.exit(1);
});
