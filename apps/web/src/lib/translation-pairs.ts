/**
 * Supported translation pairs — client-safe mirror of opus.ts SUPPORTED_PAIRS.
 * Keep in sync with apps/web/src/lib/opus.ts when adding new model pairs.
 */

const SUPPORTED_PAIRS = new Set(["sv_en", "en_sv"]);

export function isTranslationPairSupported(source: string, target: string): boolean {
  return SUPPORTED_PAIRS.has(`${source.toLowerCase()}_${target.toLowerCase()}`);
}
