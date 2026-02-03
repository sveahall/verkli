const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_MAX_TEXT_LENGTH = 1000;
const DEFAULT_TIMEOUT_MS = 15000;

let activeSyntheses = 0;

class TtsError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "TtsError";
    if (details) {
      this.details = details;
    }
  }
}

function getRepoRoot() {
  // When running Electron from the repo root, __dirname will be the repo root.
  // Fall back to process.cwd() otherwise.
  const dir = __dirname || process.cwd();
  return dir;
}

function getConfig() {
  const repoRoot = getRepoRoot();

  const modelPath =
    process.env.TTS_MODEL_PATH ||
    path.join(repoRoot, "vendor/tts/voices/sv_SE-nst-medium.onnx");
  const configPath =
    process.env.TTS_CONFIG_PATH ||
    path.join(repoRoot, "vendor/tts/voices/sv_SE-nst-medium.onnx.json");
  const dataDir =
    process.env.TTS_DATA_DIR ||
    path.join(repoRoot, "vendor/tts/voices");

  // Prefer explicit TTS_BIN; otherwise fall back to vendored Piper binary
  const bin =
    process.env.TTS_BIN ||
    path.join(repoRoot, "vendor/tts/piper/piper/piper");

  return { modelPath, configPath, dataDir, bin, repoRoot };
}

async function createTempWavPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "verkli-desktop-tts-"));
  const suffix = randomBytes(6).toString("hex");
  return path.join(dir, `output-${suffix}.wav`);
}

async function validateFiles({ bin, modelPath, configPath, dataDir }) {
  const [binStat, modelStat, configStat, dataDirStat] = await Promise.allSettled([
    fs.stat(bin),
    fs.stat(modelPath),
    fs.stat(configPath),
    fs.stat(dataDir),
  ]);

  if (binStat.status !== "fulfilled" || !binStat.value.isFile()) {
    throw new TtsError(
      `Piper-binären hittades inte eller är inte en fil: ${bin}\n` +
        `Kontrollera att Piper är installerad och att TTS_BIN pekar på rätt binär.`,
    );
  }

  if (modelStat.status !== "fulfilled" || !modelStat.value.isFile()) {
    throw new TtsError(
      `TTS-modellen hittades inte på sökvägen: ${modelPath}\n` +
        `Kontrollera att modellfilen finns (vendor/tts/voices/*.onnx) eller sätt TTS_MODEL_PATH.`,
    );
  }

  if (configStat.status !== "fulfilled" || !configStat.value.isFile()) {
    throw new TtsError(
      `TTS-konfigurationen hittades inte på sökvägen: ${configPath}\n` +
        `Kontrollera att config-filen finns (vendor/tts/voices/*.json) eller sätt TTS_CONFIG_PATH.`,
    );
  }

  if (dataDirStat.status !== "fulfilled" || !dataDirStat.value.isDirectory()) {
    throw new TtsError(
      `TTS-datakatalogen hittades inte eller är inte en katalog: ${dataDir}\n` +
        `Kontrollera att katalogen vendor/tts/voices finns eller sätt TTS_DATA_DIR.`,
    );
  }
}

async function synthesizeTextToWavBytes(text) {
  const normalized = text?.toString() ?? "";
  const trimmed = normalized.trim();

  if (!trimmed) {
    throw new TtsError("Texten får inte vara tom.");
  }
  const maxChars = Number(process.env.TTS_MAX_CHARS || DEFAULT_MAX_TEXT_LENGTH);
  if (trimmed.length > maxChars) {
    throw new TtsError(`Texten är för lång (max ${maxChars} tecken).`);
  }

  const maxConcurrency = Math.min(
    16,
    Math.max(1, Number(process.env.TTS_MAX_CONCURRENCY || 1)),
  );
  if (activeSyntheses >= maxConcurrency) {
    throw new TtsError("TTS är upptaget. Försök igen om en liten stund.");
  }

  const { modelPath, configPath, dataDir, bin, repoRoot } = getConfig();
  await validateFiles({ bin, modelPath, configPath, dataDir });

  const outputPath = await createTempWavPath();

  const args = ["-m", modelPath, "-c", configPath, "--data-dir", dataDir, "-f", outputPath];

  const defaultLibDir = path.join(repoRoot, "vendor/tts/piper/piper");

  const env = {
    ...process.env,
    // Help Piper find its dylibs on macOS; no-op on Linux.
    DYLD_LIBRARY_PATH: [
      defaultLibDir,
      process.env.DYLD_LIBRARY_PATH,
    ]
      .filter(Boolean)
      .join(path.delimiter),
  };

  const timeoutMs = Number(process.env.TTS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  let stdout = "";
  let stderr = "";
  let child;

  activeSyntheses += 1;
  const startedAt = Date.now();

  try {
    child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], env });

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.stdin.write(trimmed);
    child.stdin.end();

    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(
          new TtsError(
            `TTS-syntes avbröts efter ${timeoutMs} ms.\n` +
              "Kontrollera Piper-installationen och försök igen.",
            { stdout, stderr },
          ),
        );
      }, timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(
          new TtsError(
            `Kunde inte starta Piper-processen: ${String(err?.message || err)}`,
            { stdout, stderr },
          ),
        );
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });

    const durationMs = Date.now() - startedAt;

    if (result.code !== 0) {
      console.error("[electron-tts] Piper-processen misslyckades", {
        code: result.code,
        signal: result.signal,
        duration_ms: durationMs,
        stderr_tail: stderr.slice(-500),
      });
      throw new TtsError(
        `TTS-syntes misslyckades (exit code ${result.code}).\n` +
          "Kontrollera Piper-installationen och loggarna.",
        { stdout, stderr },
      );
    }

    let wav;
    try {
      wav = await fs.readFile(outputPath);
    } catch (err) {
      console.error("[electron-tts] Kunde inte läsa WAV-fil", err);
      throw new TtsError(
        "TTS-syntes verkade lyckas, men ljudfilen kunde inte läsas från disk.",
      );
    }

    // Best-effort clean-up
    try {
      await fs.unlink(outputPath);
      await fs.rmdir(path.dirname(outputPath));
    } catch {
      // ignore cleanup errors
    }

    return wav;
  } finally {
    activeSyntheses = Math.max(0, activeSyntheses - 1);
  }
}

module.exports = {
  TtsError,
  synthesizeTextToWavBytes,
};

