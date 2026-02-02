/**
 * Minimal wrapper for local Opus MT. Calls CLI/binary via child_process.
 * Expects: command reads text from stdin, accepts source and target language as args, outputs translation to stdout.
 * Set OPUS_MT_CMD to the binary or script (e.g. "opus-mt" or "python -m opus_mt"). If unset, throws.
 */

import { spawnSync } from "child_process";

export type TranslateOptions = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
};

/**
 * Translate text using local Opus MT. Returns translated text.
 * Command is run with args [sourceLanguage, targetLanguage]; stdin = text, stdout = result.
 */
export function translate(options: TranslateOptions): string {
  const { text, sourceLanguage, targetLanguage } = options;
  const cmd = process.env.OPUS_MT_CMD?.trim();
  if (!cmd) {
    throw new Error("OPUS_MT_CMD is not set. Set it to your local Opus MT binary or script (e.g. opus-mt or python -m opus_mt).");
  }

  const parts = cmd.split(/\s+/);
  const binary = parts[0];
  const defaultArgs = parts.slice(1);
  const args = [...defaultArgs, sourceLanguage, targetLanguage];

  const result = spawnSync(binary, args, {
    input: text,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`Opus MT spawn failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "(no stderr)";
    throw new Error(`Opus MT exited ${result.status}: ${stderr}`);
  }

  return (result.stdout ?? "").trim();
}
