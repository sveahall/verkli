import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_MAX_TEXT_LENGTH = 1000;
const DEFAULT_TIMEOUT_MS = 15000;

let activeSyntheses = 0;

export class TtsBusyError extends Error {
  constructor(message = "TTS is busy") {
    super(message);
    this.name = "TtsBusyError";
  }
}

export class TtsDisabledError extends Error {
  constructor(message = "TTS is disabled") {
    super(message);
    this.name = "TtsDisabledError";
  }
}

export class TtsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsValidationError";
  }
}

export class TtsSynthesisError extends Error {
  stdout?: string;
  stderr?: string;

  constructor(message: string, opts?: { stdout?: string; stderr?: string }) {
    super(message);
    this.name = "TtsSynthesisError";
    this.stdout = opts?.stdout;
    this.stderr = opts?.stderr;
  }
}

function isTtsEnabled(): boolean {
  const flag = process.env.TTS_ENABLED;
  if (!flag) return true;

  // Minimal, production-safe diagnostics: log exact raw value when TTS is disabled.
  const enabled = flag.toLowerCase() === "true" || flag === "1";
  if (!enabled) {
    console.warn("[tts] TTS_ENABLED is set but not enabling TTS", {
      TTS_ENABLED_raw: JSON.stringify(flag),
    });
  }
  return enabled;
}

function getEnvOrDefault(key: string, fallback: string): string {
  const value = process.env[key];
  if (value && value.trim() !== "") return value;
  return fallback;
}

function getMaxChars(): number {
  const raw = process.env.TTS_MAX_CHARS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0 && n <= 20000) {
    return Math.floor(n);
  }
  return DEFAULT_MAX_TEXT_LENGTH;
}

function getMaxConcurrency(): number {
  const raw = process.env.TTS_MAX_CONCURRENCY;
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 1;
  if (n > 16) return 16;
  return Math.floor(n);
}

function getRepoRoot(): string {
  // Assume Next.js app runs from apps/web; repo root is one level up.
  // In workers or other contexts, process.cwd() may already be repo root.
  const cwd = process.cwd();
  const parts = cwd.split(path.sep);
  const appsIndex = parts.lastIndexOf("apps");
  if (appsIndex > 0) {
    return parts.slice(0, appsIndex).join(path.sep);
  }
  return cwd;
}

function getConfig() {
  const repoRoot = getRepoRoot();

  const modelPath = getEnvOrDefault(
    "TTS_MODEL_PATH",
    path.join(repoRoot, "vendor/tts/voices/sv_SE-nst-medium.onnx"),
  );
  const configPath = getEnvOrDefault(
    "TTS_CONFIG_PATH",
    path.join(repoRoot, "vendor/tts/voices/sv_SE-nst-medium.onnx.json"),
  );
  const dataDir = getEnvOrDefault(
    "TTS_DATA_DIR",
    path.join(repoRoot, "vendor/tts/voices"),
  );
  const binRaw = process.env.TTS_BIN;

  if (!binRaw || binRaw.trim() === "") {
    throw new TtsValidationError(
      "TTS_BIN is not set. Please configure TTS_BIN as an absolute path to the Piper binary in apps/web/.env.local (e.g. /usr/local/anaconda3/envs/verkli-py311/bin/piper).",
    );
  }

  const bin = binRaw.trim();

  if (!path.isAbsolute(bin)) {
    throw new TtsValidationError(
      `TTS_BIN must be an absolute path, but got '${bin}'. Example: /usr/local/anaconda3/envs/verkli-py311/bin/piper. Configure this in apps/web/.env.local.`,
    );
  }

  return { modelPath, configPath, dataDir, bin };
}

async function createTempWavPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "verkli-tts-"));
  const suffix = randomBytes(6).toString("hex");
  return path.join(dir, `output-${suffix}.wav`);
}

export async function synthesizeTextToWavBytes(text: string): Promise<Buffer> {
  if (!isTtsEnabled()) {
    throw new TtsDisabledError();
  }

  const maxChars = getMaxChars();

  const normalized = text?.toString() ?? "";
  const trimmed = normalized.trim();

  if (!trimmed) {
    throw new TtsValidationError("Text must not be empty");
  }
  if (trimmed.length > maxChars) {
    throw new TtsValidationError(`Text is too long (max ${maxChars} characters)`);
  }

  const maxConcurrency = getMaxConcurrency();
  if (activeSyntheses >= maxConcurrency) {
    throw new TtsBusyError();
  }

  const { modelPath, configPath, dataDir, bin } = getConfig();
  try {
    // Validate filesystem state for all critical TTS assets up-front so we fail
    // fast and loudly, and never fall back to PATH resolution.
    const [binStat, modelStat, configStat, dataDirStat] = await Promise.allSettled([
      fs.stat(bin),
      fs.stat(modelPath),
      fs.stat(configPath),
      fs.stat(dataDir),
    ]);

    if (binStat.status !== "fulfilled" || !binStat.value.isFile()) {
      throw new TtsValidationError(
        `TTS binary not found or not a file at ${bin}. Set TTS_BIN to a valid absolute Piper binary path in apps/web/.env.local (e.g. /usr/local/anaconda3/envs/verkli-py311/bin/piper).`,
      );
    }

    if (modelStat.status !== "fulfilled" || !modelStat.value.isFile()) {
      throw new TtsValidationError(
        `TTS model not found at ${modelPath}. Set TTS_MODEL_PATH to an absolute path in production.`,
      );
    }
    if (configStat.status !== "fulfilled" || !configStat.value.isFile()) {
      throw new TtsValidationError(
        `TTS config not found at ${configPath}. Set TTS_CONFIG_PATH to an absolute path in production.`,
      );
    }
    if (dataDirStat.status !== "fulfilled" || !dataDirStat.value.isDirectory()) {
      throw new TtsValidationError(
        `TTS data directory not found at ${dataDir}. Set TTS_DATA_DIR to an absolute path in production.`,
      );
    }
  } catch (err) {
    if (err instanceof TtsValidationError) {
      throw err;
    }
    throw new TtsValidationError("TTS model/config validation failed");
  }

  const outputPath = await createTempWavPath();

  const args = ["-m", modelPath, "-c", configPath, "--data-dir", dataDir, "-f", outputPath];

  const startedAt = Date.now();
  activeSyntheses += 1;

  // Log exactly which Piper binary we are about to spawn, and the raw env var
  // value, to make future debugging of misconfigured environments unambiguous.
  console.log("[tts] Piper spawn configuration", {
    resolved_bin_path: bin,
    TTS_BIN_raw: process.env.TTS_BIN ?? null,
  });

  // Ensure the Piper subprocess can find its vendored dylibs on macOS.
  // This is a no-op on Linux, since DYLD_LIBRARY_PATH is ignored there.
  const repoRoot = getRepoRoot();
  const defaultLibDir = path.join(repoRoot, "vendor/tts/piper/piper");

  const env = {
    ...process.env,
    // Prepend the vendored lib directory if it exists; fall back to the
    // existing DYLD_LIBRARY_PATH if the directory is missing.
    ...(defaultLibDir
      ? {
          DYLD_LIBRARY_PATH: [
            defaultLibDir,
            process.env.DYLD_LIBRARY_PATH,
          ]
            .filter(Boolean)
            .join(path.delimiter),
        }
      : {}),
  };

  const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], env });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.stdin.write(trimmed);
  child.stdin.end();

  const timeoutMs = Number(process.env.TTS_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          const err = new TtsSynthesisError(
            `TTS synthesis timed out after ${timeoutMs}ms`,
            { stdout, stderr },
          );
          reject(err);
        }, timeoutMs);

        child.on("error", (err) => {
          clearTimeout(timer);
          reject(
            new TtsSynthesisError(`Failed to start TTS process: ${String(err.message ?? err)}`, {
              stdout,
              stderr,
            }),
          );
        });

        child.on("close", (code, signal) => {
          clearTimeout(timer);
          resolve({ code, signal });
        });
      },
    );

    const durationMs = Date.now() - startedAt;

    if (result.code !== 0) {
      // TODO: integrate with metrics system (e.g. increment tts_failures counter) if/when available.
      console.error("[tts] Piper process failed", {
        error_type: "exit_code",
        code: result.code,
        signal: result.signal,
        duration_ms: durationMs,
        stdout_tail: stdout.slice(-500),
        stderr_tail: stderr.slice(-500),
      });
      throw new TtsSynthesisError(
        `TTS synthesis failed with exit code ${result.code ?? "null"}`,
        { stdout, stderr },
      );
    }

    try {
      const wav = await fs.readFile(outputPath);

      // TODO: integrate with metrics system (e.g. histogram for duration, counter for successes).
      console.log("[tts] Piper synthesis ok", {
        error_type: "none",
        duration_ms: durationMs,
        exit_code: result.code ?? 0,
        signal: result.signal ?? null,
        wav_size_bytes: wav.byteLength,
      });

      // Clean up temp directory best-effort.
      try {
        await fs.unlink(outputPath);
        await fs.rmdir(path.dirname(outputPath));
      } catch {
        // ignore cleanup errors
      }

      return wav;
    } catch (err) {
      console.error("[tts] Failed to read WAV output", {
        error_type: "read_failed",
        duration_ms: durationMs,
      });
      throw new TtsSynthesisError("Failed to read synthesized WAV from disk");
    }
  } finally {
    activeSyntheses = Math.max(0, activeSyntheses - 1);
  }
}

