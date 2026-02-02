/**
 * Opus MT translation via local CTranslate2 model (Python script).
 * Requires OPUSMT_PYTHON and OPUSMT_MODELS_DIR; validates model dir and required files before running.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const TRANSLATE_TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

const REQUIRED_MODEL_FILES = ["model.bin", "source.spm", "target.spm"] as const;

export type TranslateTextOptions = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
};

function getPythonPath(): string {
  const pythonPath = process.env.OPUSMT_PYTHON?.trim();
  if (!pythonPath) {
    throw new Error("OPUSMT_PYTHON is not set. Set it to the absolute path of your Python venv binary (e.g. /path/to/venvs/opusmt/bin/python).");
  }
  return pythonPath;
}

/**
 * Resolve and validate model directory for source -> target. Uses OPUSMT_MODELS_DIR; for sv->en uses subdir sv_en.
 */
function getModelDir(sourceLanguage: string, targetLanguage: string): string {
  const baseDir = process.env.OPUSMT_MODELS_DIR?.trim();
  if (!baseDir) {
    throw new Error("OPUSMT_MODELS_DIR is not set. Set it to the directory containing model subdirs (e.g. /path/to/apps/web/models).");
  }
  const src = sourceLanguage.toLowerCase().trim();
  const tgt = targetLanguage.toLowerCase().trim();
  if (src === "sv" && tgt === "en") {
    const modelDir = path.join(baseDir, "sv_en");
    if (!fs.existsSync(modelDir) || !fs.statSync(modelDir).isDirectory()) {
      throw new Error(`Model directory does not exist or is not a directory: ${modelDir}`);
    }
    for (const file of REQUIRED_MODEL_FILES) {
      const filePath = path.join(modelDir, file);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        throw new Error(`Required model file missing or not a file: ${filePath}. Required: ${REQUIRED_MODEL_FILES.join(", ")}`);
      }
    }
    return modelDir;
  }
  throw new Error(`Unsupported language pair: ${sourceLanguage} -> ${targetLanguage}. Only sv -> en is supported.`);
}

/**
 * Detokenizes Opus MT output while preserving paragraph structure.
 */
export function sanitizeOpusOutput(raw: string): string {
  if (!raw) {
    throw new Error("Opus MT output was empty");
  }

  let text = raw
    .split("\n")
    .map(l => l.trim())
    .filter(l =>
      l &&
      !l.startsWith("Intel") &&
      !l.includes("MKL") &&
      !l.startsWith("WARNING") &&
      !l.startsWith("[") &&
      !l.startsWith("ctranslate2") &&
      !l.startsWith("SentencePiece")
    )
    .join("\n");

  // SentencePiece whitespace
  text = text.replace(/\u2581+/g, " ");

  // Legacy underscore safety
  text = text.replace(/_+/g, " ");

  // Remove space before punctuation
  text = text.replace(/\s+([.,!?;:])/g, "$1");

  // Normalize newlines only
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (!text) {
    throw new Error("Opus MT output was empty after sanitization");
  }

  return text;
}

/**
 * Translate text using local Opus MT (Python + CTranslate2). Returns translated text.
 * Spawns Python with timeout and clear errors.
 */
export function translateText(options: TranslateTextOptions): string {
  const { text, sourceLanguage, targetLanguage } = options;

  const pythonPath = getPythonPath();
  const modelDir = getModelDir(sourceLanguage, targetLanguage);
  const scriptPath = path.join(process.cwd(), "scripts", "opus_translate.py");

  const result = spawnSync(pythonPath, [scriptPath, modelDir, sourceLanguage, targetLanguage], {
    input: text,
    encoding: "utf-8",
    timeout: TRANSLATE_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER_BYTES,
  });

  if (result.error) {
    throw new Error(`Opus MT spawn failed: ${result.error.message}`);
  }
  if (result.signal === "SIGTERM" || result.signal === "SIGKILL") {
    throw new Error(`Opus MT timed out after ${TRANSLATE_TIMEOUT_MS / 1000}s`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "(no stderr)";
    throw new Error(`Opus MT exited ${result.status}: ${stderr}`);
  }

  return (result.stdout ?? "").trim();
}
