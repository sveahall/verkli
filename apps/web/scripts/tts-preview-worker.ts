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
import { spawn } from "child_process";
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
const QWEN_PYTHON_DEFAULT = path.join(REPO_ROOT, "qwen3tts-env", "bin", "python3.12");
const TTS_PREVIEW_BUCKET = "tts_previews";
const POLL_INTERVAL_MS = 2000;
const SYNTH_TIMEOUT_MS = 120_000;
const STALE_MINUTES = 3;
const DEBUG = process.env.TTS_LAB_DEBUG === "1";

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

function resolveQwenPythonPath(): string {
  const configured = process.env.QWEN_TTS_PYTHON?.trim();
  if (configured) return configured;
  if (existsSync(QWEN_PYTHON_DEFAULT)) return QWEN_PYTHON_DEFAULT;
  return "python3.12";
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

async function synthesizeWithQwen(
  text: string,
  outputPath: string,
  voiceId: string
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
    voiceId,
    "--max-chars",
    "500",
    "--batch-size",
    "1",
    "--max-new-tokens",
    "2048",
    "--xvector-only",
    process.env.QWEN_TTS_XVECTOR_ONLY === "0" ? "0" : "1",
    "--clone-non-streaming-mode",
    process.env.QWEN_TTS_CLONE_NON_STREAMING_MODE === "1" ? "1" : "0",
  ];

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
      stderr += chunk.toString();
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

  try {
    const outputPath = path.join(tmpDir, "output.wav");
    const wav = await synthesizeWithQwen(job.text, outputPath, job.voice_id);

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
  log("starting – polling tts_preview_jobs (queued)");

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
