/**
 * Picks the book-translation engine.
 *
 * When the critic flag is on and both keys exist, OpenAI drafts, Anthropic
 * audits, and OpenAI revises. Otherwise Anthropic goes first and OpenAI is
 * only the standby for an outage. Do not import this from a client component:
 * it reads API keys.
 *
 * No `server-only` import. The translation worker is a plain Node process, and
 * that package throws outside the Next.js server bundle.
 */

import { isTranslationPairSupported } from "@/lib/translation-pairs";
import type { MeterContext } from "@/lib/usage/types";

import { anthropicTranslator } from "./anthropic-translator";
import { openaiTranslator } from "./openai-translator";
import { translateBatchWithCritic, translationUsesCriticLoop } from "./translation-critic";
import type { TranslatorProvider } from "./types";
import { AIProviderError } from "./types";

export { translationUsesCriticLoop };

function configuredTranslators(): TranslatorProvider[] {
  const providers: TranslatorProvider[] = [];
  if (process.env.ANTHROPIC_API_KEY?.trim()) providers.push(anthropicTranslator);
  if (process.env.OPENAI_API_KEY?.trim()) providers.push(openaiTranslator);
  return providers;
}

export function configuredTranslatorNames(): string[] {
  return configuredTranslators().map((provider) => provider.name);
}

/**
 * Fail over only when the engine itself is unreachable. A wrong-shaped reply
 * stays on the same provider so the worker's own retries do not also pay the
 * standby.
 */
export function isTranslationFailoverError(err: unknown): boolean {
  if (!(err instanceof AIProviderError)) return false;
  if (err.code === "TIMEOUT" || err.code === "RATE_LIMITED" || err.code === "PROVIDER_UNAVAILABLE") {
    return true;
  }
  const message = err.message.toLowerCase();
  return message.includes("status 5") || message.includes("overloaded") || message.includes("bad gateway");
}

export async function runWithTranslationFallback<T>(
  providers: TranslatorProvider[],
  run: (provider: TranslatorProvider) => Promise<T>
): Promise<T> {
  if (providers.length === 0) {
    throw new AIProviderError(
      "Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set.",
      "PROVIDER_UNAVAILABLE",
      "anthropic"
    );
  }

  let last: AIProviderError | null = null;
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      return await run(provider);
    } catch (err) {
      last = err instanceof AIProviderError ? err : AIProviderError.fromError(err, provider.name);
      const hasStandby = i < providers.length - 1;
      if (!hasStandby || !isTranslationFailoverError(last)) throw last;
    }
  }
  throw last ?? new AIProviderError("Translation failed.", "UNKNOWN", "anthropic");
}

async function translateBatch(
  providers: TranslatorProvider[],
  texts: string[],
  sourceLanguage: string,
  targetLanguage: string,
  meter?: MeterContext,
): Promise<string[]> {
  if (translationUsesCriticLoop()) {
    return translateBatchWithCritic(texts, sourceLanguage, targetLanguage, meter);
  }
  return runWithTranslationFallback(providers, (provider) => {
    if (provider.translateBatch) {
      return provider.translateBatch(texts, sourceLanguage, targetLanguage, meter);
    }
    return Promise.all(
      texts.map(async (text) => {
        const result = await provider.translate({ text, sourceLanguage, targetLanguage, meter });
        return result.translatedText;
      })
    );
  });
}

export function getTranslatorForPair(source: string, target: string): TranslatorProvider | null {
  if (!isTranslationPairSupported(source, target)) return null;
  const providers = configuredTranslators();
  const critic = translationUsesCriticLoop();
  return {
    name: critic ? "openai+anthropic" : providers[0]?.name ?? "anthropic",
    getSupportedPairs: () => providers[0]?.getSupportedPairs() ?? [],
    translate: async (options) => {
      const [translatedText] = await translateBatch(
        providers,
        [options.text],
        options.sourceLanguage,
        options.targetLanguage,
        options.meter,
      );
      return { translatedText };
    },
    translateBatch: (texts, sourceLanguage, targetLanguage, meter) =>
      translateBatch(providers, texts, sourceLanguage, targetLanguage, meter),
  };
}
