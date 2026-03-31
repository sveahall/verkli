/**
 * AI Provider Registry (Workers)
 *
 * Worker-safe provider access. This file must not import Next.js server-only modules.
 * Supports Opus MT (sv<->en) and NVIDIA Riva (multi-language).
 */

// Types
export type {
  TranslatorProvider,
  TranslateOptions,
  TranslateResult,
  AIProviderErrorCode,
} from "./types";

// Error class
export { AIProviderError } from "./types";

// Worker-safe provider instances
import { opusTranslator } from "./opus-translator";
import { nvidiaRivaTranslator } from "./nvidia-riva-translator";
import { ChainTranslator } from "./chain-translator";
import { getProviderForPair } from "@/lib/translation-pairs";
import type { TranslatorProvider } from "./types";

// Re-export provider classes for direct instantiation if needed
export { OpusTranslator, opusTranslator } from "./opus-translator";
export { NvidiaRivaTranslator, nvidiaRivaTranslator } from "./nvidia-riva-translator";
export { ChainTranslator } from "./chain-translator";

/**
 * Get the configured translator provider.
 * Falls back to Opus MT for backwards compatibility.
 */
export function getTranslator(): typeof opusTranslator {
  return opusTranslator;
}

/**
 * Get the appropriate translator for a given language pair.
 * Chain pairs (sv <-> Riva langs) route through en as intermediate.
 * Returns null if the pair is not supported by any provider.
 */
export function getTranslatorForPair(source: string, target: string): TranslatorProvider | null {
  const provider = getProviderForPair(source, target);
  if (provider === "opus") return opusTranslator;
  if (provider === "nvidia-riva") return nvidiaRivaTranslator;
  if (provider === "chain") {
    const src = source.toLowerCase();
    if (src === "sv") return new ChainTranslator(opusTranslator, nvidiaRivaTranslator);
    return new ChainTranslator(nvidiaRivaTranslator, opusTranslator);
  }
  return null;
}
