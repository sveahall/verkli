/**
 * Opus MT Translator Provider
 *
 * Wraps the existing src/lib/opus.ts implementation.
 * Uses local CTranslate2 models via Python.
 */

import type { TranslatorProvider, TranslateOptions, TranslateResult } from "./types";
import { AIProviderError } from "./types";
import { translateText, translateBatch as opusTranslateBatch, sanitizeOpusOutput, sanitizeTranslatedText } from "@/lib/opus";

const SUPPORTED_PAIRS = ["sv -> en", "en -> sv"];

export class OpusTranslator implements TranslatorProvider {
  readonly name = "opus-mt";

  async translate(options: TranslateOptions): Promise<TranslateResult> {
    const { text, sourceLanguage, targetLanguage } = options;

    try {
      const rawOutput = translateText({
        text,
        sourceLanguage,
        targetLanguage,
      });

      const translatedText = sanitizeOpusOutput(rawOutput);

      return { translatedText };
    } catch (err) {
      throw AIProviderError.fromError(err, this.name);
    }
  }

  async translateBatch(texts: string[], sourceLanguage: string, targetLanguage: string): Promise<string[]> {
    try {
      const raw = opusTranslateBatch({ texts, sourceLanguage, targetLanguage });
      return raw.map((t, i) => {
        const sanitized = sanitizeTranslatedText(t);
        if (!sanitized.trim() && texts[i].trim()) return texts[i];
        return sanitized;
      });
    } catch (err) {
      throw AIProviderError.fromError(err, this.name);
    }
  }

  getSupportedPairs(): string[] {
    return SUPPORTED_PAIRS;
  }
}

/** Default translator instance */
export const opusTranslator = new OpusTranslator();
