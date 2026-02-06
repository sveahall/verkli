/**
 * Opus MT Translator Provider
 *
 * Wraps the existing src/lib/opus.ts implementation.
 * Uses local CTranslate2 models via Python.
 */

import type { TranslatorProvider, TranslateOptions, TranslateResult } from "./types";
import { translateText, sanitizeOpusOutput } from "@/lib/opus";

const SUPPORTED_PAIRS = ["sv -> en", "en -> sv"];

export class OpusTranslator implements TranslatorProvider {
  readonly name = "opus-mt";

  async translate(options: TranslateOptions): Promise<TranslateResult> {
    const { text, sourceLanguage, targetLanguage } = options;

    // translateText is synchronous but we wrap in Promise for interface consistency
    const rawOutput = translateText({
      text,
      sourceLanguage,
      targetLanguage,
    });

    const translatedText = sanitizeOpusOutput(rawOutput);

    return { translatedText };
  }

  getSupportedPairs(): string[] {
    return SUPPORTED_PAIRS;
  }
}

/** Default translator instance */
export const opusTranslator = new OpusTranslator();
