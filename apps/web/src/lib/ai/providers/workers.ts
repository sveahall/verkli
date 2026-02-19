/**
 * AI Provider Registry (Workers)
 *
 * Worker-safe provider access. This file must not import Next.js server-only modules.
 * Environment variables (optional, defaults shown):
 *   AI_TRANSLATOR_PROVIDER=opus  (only opus supported currently)
 *   Narrator provider is temporarily disabled.
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
import { opusTranslator } from "./opus-translator";
import { removedNarrator } from "./narrator-removed";

// Re-export provider classes for direct instantiation if needed
export { OpusTranslator, opusTranslator } from "./opus-translator";
export { RemovedNarrator, removedNarrator } from "./narrator-removed";

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
 * Legacy local TTS has been removed. This currently returns a removal stub.
 */
export function getNarrator(): typeof removedNarrator {
  return removedNarrator;
}
