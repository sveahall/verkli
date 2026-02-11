/**
 * AI Provider Registry (Workers)
 *
 * Worker-safe provider access. This file must not import Next.js server-only modules.
 * Environment variables (optional, defaults shown):
 *   AI_TRANSLATOR_PROVIDER=opus  (only opus supported currently)
 *   AI_NARRATOR_PROVIDER=piper   (only piper supported currently)
 */

// Types
export type {
  TranslatorProvider,
  TranslateOptions,
  TranslateResult,
  NarratorProvider,
  NarrateOptions,
  NarrateResult,
  VideoProvider,
  VideoGenerateOptions,
  VideoGenerateResult,
  ImageProvider,
  ImageGenerateOptions,
  ImageGenerateResult,
  CopywriterProvider,
  CopywriterGenerateOptions,
  CopywriterGenerateResult,
  AIProviderErrorCode,
} from "./types";

// Error class
export { AIProviderError } from "./types";

// Worker-safe provider instances
import { opusTranslator, OpusTranslator } from "./opus-translator";
import { piperNarrator, PiperNarrator } from "./piper-narrator";

// Re-export provider classes for direct instantiation if needed
export { OpusTranslator, opusTranslator } from "./opus-translator";
export { PiperNarrator, piperNarrator } from "./piper-narrator";

/**
 * Get the configured translator provider.
 * Currently only supports Opus MT. Future: add more providers.
 */
export function getTranslator(): typeof opusTranslator {
  const provider = process.env.AI_TRANSLATOR_PROVIDER?.toLowerCase() ?? "opus";

  switch (provider) {
    case "opus":
    default:
      return opusTranslator;
  }
}

/**
 * Get the configured narrator (TTS) provider.
 * Currently only supports Piper. Future: add cloud TTS providers.
 */
export function getNarrator(): typeof piperNarrator {
  const provider = process.env.AI_NARRATOR_PROVIDER?.toLowerCase() ?? "piper";

  switch (provider) {
    case "piper":
    default:
      return piperNarrator;
  }
}
