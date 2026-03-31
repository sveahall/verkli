/**
 * Chain Translator — two-hop translation via an intermediate language.
 *
 * Used for sv <-> Riva languages where no single provider covers the pair.
 * Route: sv → en (Opus MT) → target (Riva), or source (Riva) → en → sv (Opus MT).
 */

import type { TranslatorProvider, TranslateOptions, TranslateResult } from "./types";
import { AIProviderError } from "./types";

const INTERMEDIATE_LANGUAGE = "en";

export class ChainTranslator implements TranslatorProvider {
  readonly name = "chain";

  constructor(
    private first: TranslatorProvider,
    private second: TranslatorProvider,
  ) {}

  async translate(options: TranslateOptions): Promise<TranslateResult> {
    try {
      const intermediate = await this.first.translate({
        text: options.text,
        sourceLanguage: options.sourceLanguage,
        targetLanguage: INTERMEDIATE_LANGUAGE,
      });

      return this.second.translate({
        text: intermediate.translatedText,
        sourceLanguage: INTERMEDIATE_LANGUAGE,
        targetLanguage: options.targetLanguage,
      });
    } catch (err) {
      throw AIProviderError.fromError(err, this.name);
    }
  }

  async translateBatch(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    try {
      // Step 1: source → en
      const intermediateTexts = this.first.translateBatch
        ? await this.first.translateBatch(texts, sourceLanguage, INTERMEDIATE_LANGUAGE)
        : await Promise.all(
            texts.map(async (text) => {
              if (!text.trim()) return text;
              const r = await this.first.translate({
                text,
                sourceLanguage,
                targetLanguage: INTERMEDIATE_LANGUAGE,
              });
              return r.translatedText;
            }),
          );

      // Step 2: en → target
      return this.second.translateBatch
        ? await this.second.translateBatch(intermediateTexts, INTERMEDIATE_LANGUAGE, targetLanguage)
        : await Promise.all(
            intermediateTexts.map(async (text) => {
              if (!text.trim()) return text;
              const r = await this.second.translate({
                text,
                sourceLanguage: INTERMEDIATE_LANGUAGE,
                targetLanguage,
              });
              return r.translatedText;
            }),
          );
    } catch (err) {
      throw AIProviderError.fromError(err, this.name);
    }
  }

  getSupportedPairs(): string[] {
    return ["sv -> *", "* -> sv"];
  }
}
