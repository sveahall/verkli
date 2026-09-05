import "server-only";

/**
 * AI Provider Registry (Server / Next.js)
 *
 * Provides access to AI capabilities via interfaces.
 * Supports Anthropic, Opus MT (sv<->en), and NVIDIA Riva (multi-language).
 *
 * Usage:
 *   import { getTranslatorForPair } from "@/lib/ai/providers/server";
 *   const translator = getTranslatorForPair("en", "fr");
 *   const result = await translator.translate({ text, sourceLanguage, targetLanguage });
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

// Provider instances
import { opusTranslator } from "./opus-translator";
import { nvidiaRivaTranslator } from "./nvidia-riva-translator";
import { anthropicTranslator } from "./anthropic-translator";
import { ChainTranslator } from "./chain-translator";
import { getProviderForPair } from "@/lib/translation-pairs";
import type { TranslatorProvider } from "./types";

// Re-export provider classes
export { OpusTranslator, opusTranslator } from "./opus-translator";
export { NvidiaRivaTranslator, nvidiaRivaTranslator } from "./nvidia-riva-translator";
export { AnthropicTranslator, anthropicTranslator } from "./anthropic-translator";
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
 * Chain pairs (sv <-> Riva langs) route through en when Opus is enabled;
 * otherwise supported direct pairs can route through Anthropic.
 * Returns null if the pair is not supported by any provider.
 */
export function getTranslatorForPair(source: string, target: string): TranslatorProvider | null {
  const provider = getProviderForPair(source, target);
  if (provider === "opus") return opusTranslator;
  if (provider === "nvidia-riva") return nvidiaRivaTranslator;
  if (provider === "anthropic") return anthropicTranslator;
  if (provider === "chain") {
    const src = source.toLowerCase();
    // sv → target: Opus (sv→en) then Riva (en→target)
    if (src === "sv") return new ChainTranslator(opusTranslator, nvidiaRivaTranslator);
    // source → sv: Riva (source→en) then Opus (en→sv)
    return new ChainTranslator(nvidiaRivaTranslator, opusTranslator);
  }
  return null;
}
