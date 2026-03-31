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

export type TranslationProvider = "opus" | "nvidia-riva" | "chain";

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
  const key = pairKey(source, target);
  return OPUS_PAIRS.has(key) || isRivaPair(source, target) || isChainPair(source, target);
}

/**
 * Returns which provider handles this pair, or null if unsupported.
 * Opus is preferred for sv<->en since it's local/free.
 * Chain is used for sv <-> Riva languages (two-hop via en).
 */
export function getProviderForPair(source: string, target: string): TranslationProvider | null {
  const key = pairKey(source, target);
  if (OPUS_PAIRS.has(key)) return "opus";
  if (isRivaPair(source, target)) return "nvidia-riva";
  if (isChainPair(source, target)) return "chain";
  return null;
}
