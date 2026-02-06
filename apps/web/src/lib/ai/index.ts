/**
 * AI module re-exports.
 * Note: textToVideo uses "server-only" - only use in server components/API routes.
 *
 * Direct usage:
 *   import { makeVideo } from "@/lib/ai";
 *
 * Provider-based usage (recommended for new code):
 *   import { getTranslator, getNarrator, getVideoProvider } from "@/lib/ai/providers";
 */

// Direct exports (legacy, still works)
export { makeVideo, type TextToVideoOptions } from "./textToVideo";

// Provider exports
export {
  // Registry functions
  getTranslator,
  getNarrator,
  getVideoProvider,
  // Types
  type TranslatorProvider,
  type TranslateOptions,
  type TranslateResult,
  type NarratorProvider,
  type NarrateOptions,
  type NarrateResult,
  type VideoProvider,
  type VideoGenerateOptions,
  type VideoGenerateResult,
} from "./providers";
