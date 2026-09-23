/**
 * Supported translation pairs with provider routing.
 *
 * - Opus MT (local): sv <-> en
 * - NVIDIA Riva (API): all combinations of en, de, es, fr, pt, ru, zh, ja, ko, ar
 * - Chain (sv <-> Riva langs): sv → en (Opus) → target (Riva), and reverse
 *
 * Keep in sync with:
 *   - apps/web/src/lib/opus.ts SUPPORTED_PAIRS (Opus)
 *   - apps/web/src/lib/ai/providers/nvidia-riva-translator.ts RIVA_LANGUAGE_CODES (Riva)
 */

export type TranslationProvider = "opus" | "nvidia-riva" | "chain" | "anthropic";

/** Opus MT pairs (local CTranslate2 models). */
const OPUS_PAIRS = new Set(["sv_en", "en_sv"]);

/** NVIDIA Riva language codes. */
const RIVA_CODES = new Set(["en", "de", "es", "fr", "pt", "ru", "zh", "ja", "ko", "ar"]);

function pairKey(source: string, target: string): string {
  return `${source.toLowerCase()}_${target.toLowerCase()}`;
}

function isRivaPair(source: string, target: string): boolean {
  const src = source.toLowerCase();
  const tgt = target.toLowerCase();
  return src !== tgt && RIVA_CODES.has(src) && RIVA_CODES.has(tgt);
}

/**
 * Chain pair: sv <-> any Riva language (except en, which is direct via Opus).
 * Route: sv → en (Opus) → target (Riva), or source (Riva) → en → sv (Opus).
 */
function isChainPair(source: string, target: string): boolean {
  const src = source.toLowerCase();
  const tgt = target.toLowerCase();
  if (src === tgt) return false;
  // sv → Riva lang (not en, that's direct Opus)
  if (src === "sv" && tgt !== "en" && RIVA_CODES.has(tgt)) return true;
  // Riva lang → sv (not en, that's direct Opus)
  if (tgt === "sv" && src !== "en" && RIVA_CODES.has(src)) return true;
  return false;
}

export function isTranslationPairSupported(source: string, target: string): boolean {
  return getProviderForPair(source, target) !== null;
}

/**
 * Returns which provider handles this pair, or null if unsupported.
 * Opus is preferred for sv<->en since it's local/free.
 * Chain is used for sv <-> Riva languages (two-hop via en).
 */
/**
 * Languages Anthropic will translate. Deliberately a superset of Riva's, so
 * Swedish — the only source language on the platform today — has a provider at
 * all. Keep in sync with LANGUAGE_NAMES in ai/providers/anthropic-translator.ts.
 */
const ANTHROPIC_CODES = new Set([
  "ar", "da", "de", "en", "es", "fi", "fr", "it", "ja",
  "ko", "nl", "no", "pl", "pt", "ru", "sv", "zh",
]);

function isAnthropicPair(source: string, target: string): boolean {
  const src = source.toLowerCase();
  const tgt = target.toLowerCase();
  return src !== tgt && ANTHROPIC_CODES.has(src) && ANTHROPIC_CODES.has(tgt);
}

/**
 * Is the local Opus MT install actually usable?
 *
 * Opus needs a Python venv AND a downloaded `model.bin`, and the repo ships
 * only the vocab and the two .spm files. Checking the two path variables is not
 * enough — a developer machine can have both set and still be missing the
 * model, which is exactly how sv->en ends up routed into a provider that throws
 * on every job. Verifying the file would mean `fs`, and this module is imported
 * by TranslatePanel on the client, so that is not available here.
 *
 * Hence an explicit opt-in: set OPUSMT_ENABLED=true only once
 * `scripts/setup-opus-models.sh` has actually run. Absent it, Swedish routes to
 * Anthropic, which needs no local anything.
 *
 * It also keeps client and server in agreement. `process.env` reads are
 * undefined in the browser, so this is false there; making the server default
 * to false too means both sides answer the same for every pair.
 */
function isOpusUsable(): boolean {
  return (
    process.env.OPUSMT_ENABLED?.trim().toLowerCase() === "true" &&
    Boolean(process.env.OPUSMT_PYTHON?.trim() && process.env.OPUSMT_MODELS_DIR?.trim())
  );
}

export function getProviderForPair(source: string, target: string): TranslationProvider | null {
  const key = pairKey(source, target);
  // Opus is free and local, so it still wins its two pairs — but only where it
  // can actually run.
  if (OPUS_PAIRS.has(key) && isOpusUsable()) return "opus";
  if (isRivaPair(source, target)) return "nvidia-riva";
  // Chain routes sv through Opus to reach English first, so it is only an
  // option when Opus is usable. Otherwise Anthropic translates directly, which
  // is one hop instead of two and keeps the author's voice intact.
  if (isChainPair(source, target) && isOpusUsable()) return "chain";
  if (isAnthropicPair(source, target)) return "anthropic";
  return null;
}
