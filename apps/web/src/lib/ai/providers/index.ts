/**
 * AI Provider Registry
 *
 * Provides access to AI capabilities via interfaces.
 * Provider selection can be configured via environment variables.
 *
 * Usage:
 *   import { getTranslator, getNarrator, getVideoProvider } from "@/lib/ai/providers";
 *   const translator = getTranslator();
 *   const result = await translator.translate({ text, sourceLanguage, targetLanguage });
 *
 * Environment variables (optional, defaults shown):
 *   AI_TRANSLATOR_PROVIDER=opus  (only opus supported currently)
 *   AI_NARRATOR_PROVIDER=piper   (only piper supported currently)
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
} from "./types";

// Default provider instances
import { opusTranslator, OpusTranslator } from "./opus-translator";
import { piperNarrator, PiperNarrator } from "./piper-narrator";
import { runwayVideo, RunwayVideoProvider } from "./runway-video";

// Re-export provider classes for direct instantiation if needed
export { OpusTranslator, opusTranslator } from "./opus-translator";
export { PiperNarrator, piperNarrator } from "./piper-narrator";
export { RunwayVideoProvider, runwayVideo } from "./runway-video";

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
