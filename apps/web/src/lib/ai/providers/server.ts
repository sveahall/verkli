import "server-only";

/**
 * AI Provider Registry (Server / Next.js)
 *
 * Provides access to AI capabilities via interfaces.
 * Currently only supports Opus MT for translation.
 *
 * Usage:
 *   import { getTranslator } from "@/lib/ai/providers/server";
 *   const translator = getTranslator();
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

// Default provider instances
import { opusTranslator } from "./opus-translator";

// Re-export provider classes for direct instantiation if needed
export { OpusTranslator, opusTranslator } from "./opus-translator";

/**
 * Get the configured translator provider.
 * Currently only supports Opus MT.
 */
export function getTranslator(): typeof opusTranslator {
  return opusTranslator;
}
