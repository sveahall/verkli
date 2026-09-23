import "server-only";

/**
 * AI provider registry for Next.js routes.
 *
 * Book translation is Anthropic, with OpenAI as standby. The worker imports
 * `translation-runtime` directly because this file is server-only.
 *
 * Usage:
 *   import { getTranslatorForPair } from "@/lib/ai/providers/server";
 *   const translator = getTranslatorForPair("en", "da");
 *   const result = await translator.translate({ text, sourceLanguage, targetLanguage });
 */

export type {
  TranslatorProvider,
  TranslateOptions,
  TranslateResult,
  AIProviderErrorCode,
} from "./types";

export { AIProviderError } from "./types";

export { getTranslatorForPair, configuredTranslatorNames } from "./translation-runtime";
