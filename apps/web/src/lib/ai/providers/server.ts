import "server-only";

/**
 * AI Provider Registry (Server / Next.js)
 *
 * Provides access to AI capabilities via interfaces.
 * Provider selection can be configured via environment variables.
 *
 * Usage:
 *   import { getTranslator, getNarrator, getVideoProvider } from "@/lib/ai/providers/server";
 *   const translator = getTranslator();
 *   const result = await translator.translate({ text, sourceLanguage, targetLanguage });
 *
 * Environment variables (optional, defaults shown):
 *   AI_TRANSLATOR_PROVIDER=opus  (only opus supported currently)
 *   Narrator provider is temporarily disabled (PIPER_REMOVED).
 *   AI_VIDEO_PROVIDER=runway     (only runway supported currently)
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

// Default provider instances
import { opusTranslator } from "./opus-translator";
import { removedNarrator } from "./narrator-removed";
import { runwayVideo } from "./runway-video";
import { stubImage } from "./stub-image";
import { stubCopywriter } from "./stub-copywriter";

// Re-export provider classes for direct instantiation if needed
export { OpusTranslator, opusTranslator } from "./opus-translator";
export { RemovedNarrator, removedNarrator } from "./narrator-removed";
export { RunwayVideoProvider, runwayVideo } from "./runway-video";
export { StubImageProvider, stubImage } from "./stub-image";
export { StubCopywriterProvider, stubCopywriter } from "./stub-copywriter";

// ─────────────────────────────────────────────────────────────
// Provider Registry Functions
// ─────────────────────────────────────────────────────────────

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
 * Legacy local TTS has been removed. This currently returns a stub that throws PIPER_REMOVED.
 */
export function getNarrator(): typeof removedNarrator {
  return removedNarrator;
}

/**
 * Get the configured video generation provider.
 * Currently only supports Runway ML. Future: add other providers.
 */
export function getVideoProvider(): typeof runwayVideo {
  const provider = process.env.AI_VIDEO_PROVIDER?.toLowerCase() ?? "runway";

  switch (provider) {
    case "runway":
    default:
      return runwayVideo;
  }
}

/**
 * Get the configured image generation provider.
 * Defaults to stub. Swap via AI_IMAGE_PROVIDER env var.
 */
export function getImageProvider(): typeof stubImage {
  const provider = process.env.AI_IMAGE_PROVIDER?.toLowerCase() ?? "stub";

  switch (provider) {
    case "stub":
    default:
      return stubImage;
  }
}

/**
 * Get the configured copywriter (LLM) provider.
 * Defaults to stub. Swap via AI_COPYWRITER_PROVIDER env var.
 */
export function getCopywriterProvider(): typeof stubCopywriter {
  const provider = process.env.AI_COPYWRITER_PROVIDER?.toLowerCase() ?? "stub";

  switch (provider) {
    case "stub":
    default:
      return stubCopywriter;
  }
}
