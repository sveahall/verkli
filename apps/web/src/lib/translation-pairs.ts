/**
 * Which language pairs book translation accepts.
 *
 * Every supported language can be translated into every other one. The engines
 * are Anthropic and OpenAI; which of those actually runs is decided at call
 * time in `ai/providers/translation-runtime.ts` (this module is imported by the
 * author UI, so it must not read API keys).
 */

import { isSupportedLanguage } from "@/lib/languages";

export type TranslationProvider = "anthropic" | "openai";

export function isTranslationPairSupported(source: string, target: string): boolean {
  const src = source.toLowerCase();
  const tgt = target.toLowerCase();
  return src !== tgt && isSupportedLanguage(src) && isSupportedLanguage(tgt);
}

/**
 * The pair is offered. Which engine drafts it is decided when the job runs
 * (`translation-critic`), so this module can stay free of API keys.
 */
export function getProviderForPair(source: string, target: string): TranslationProvider | null {
  if (!isTranslationPairSupported(source, target)) return null;
  return "anthropic";
}
