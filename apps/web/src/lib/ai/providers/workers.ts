/**
 * AI Provider Registry (Workers)
 *
 * Worker-safe provider access. This file must not import Next.js server-only modules.
 * Currently only supports Opus MT for translation.
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

// Re-export provider classes for direct instantiation if needed
export { OpusTranslator, opusTranslator } from "./opus-translator";

/**
 * Get the configured translator provider.
 * Currently only supports Opus MT.
 */
export function getTranslator(): typeof opusTranslator {
  return opusTranslator;
}
