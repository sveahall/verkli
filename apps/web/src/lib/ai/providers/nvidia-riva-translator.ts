/**
 * NVIDIA Riva Translate 4B Instruct v1.1 Provider
 *
 * Uses the NVIDIA NIM API (OpenAI-compatible chat completions) for
 * multi-language translation. Supports: en, de, es, fr, pt, ru, zh, ja, ko, ar.
 *
 * Requires env: NVIDIA_NIM_API_KEY
 */

import type { TranslatorProvider, TranslateOptions, TranslateResult } from "./types";
import { AIProviderError } from "./types";

const NVIDIA_NIM_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL_ID = "nvidia/riva-translate-4b-instruct-v1.1";

/** Max concurrent API requests when batch-translating. */
const MAX_CONCURRENT = 5;
/** Per-request timeout (ms). */
const REQUEST_TIMEOUT_MS = 30_000;

/** Riva-supported language codes mapped to display names for the prompt. */
export const RIVA_LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
};

/** All Riva-supported language codes. */
export const RIVA_LANGUAGE_CODES = Object.keys(RIVA_LANGUAGE_NAMES);

function getApiKey(): string {
  const key = process.env.NVIDIA_NIM_API_KEY?.trim();
  if (!key) {
    throw new AIProviderError(
      "NVIDIA_NIM_API_KEY is not set. Set it in .env.local to enable NVIDIA Riva translations.",
      "PROVIDER_UNAVAILABLE",
      "nvidia-riva",
    );
  }
  return key;
}

function getLanguageName(code: string): string {
  return RIVA_LANGUAGE_NAMES[code] ?? code;
}

async function translateSingle(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  apiKey: string,
): Promise<string> {
  const sourceName = getLanguageName(sourceLanguage);
  const targetName = getLanguageName(targetLanguage);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(NVIDIA_NIM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          {
            role: "system",
            content: `You are an expert at translating text from ${sourceName} to ${targetName}. Output only the translation, nothing else.`,
          },
          {
            role: "user",
            content: `What is the ${targetName} translation of the sentence: ${text}`,
          },
        ],
        temperature: 0.2,
        max_tokens: Math.min(Math.max(Math.ceil(text.length / 2), 512), 4096),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) {
        throw new AIProviderError(
          `NVIDIA NIM rate limited: ${body.slice(0, 200)}`,
          "RATE_LIMITED",
          "nvidia-riva",
        );
      }
      throw new AIProviderError(
        `NVIDIA NIM API ${res.status}: ${body.slice(0, 300)}`,
        res.status >= 500 ? "PROVIDER_UNAVAILABLE" : "MODEL_ERROR",
        "nvidia-riva",
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const translated = data?.choices?.[0]?.message?.content?.trim();
    if (!translated) {
      throw new AIProviderError("Empty response from NVIDIA NIM API", "MODEL_ERROR", "nvidia-riva");
    }
    return translated;
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new AIProviderError(
        `NVIDIA NIM request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
        "TIMEOUT",
        "nvidia-riva",
      );
    }
    throw AIProviderError.fromError(err, "nvidia-riva");
  } finally {
    clearTimeout(timeout);
  }
}

export class NvidiaRivaTranslator implements TranslatorProvider {
  readonly name = "nvidia-riva";

  async translate(options: TranslateOptions): Promise<TranslateResult> {
    const { text, sourceLanguage, targetLanguage } = options;
    const apiKey = getApiKey();
    const translatedText = await translateSingle(text, sourceLanguage, targetLanguage, apiKey);
    return { translatedText };
  }

  /**
   * Translate an array of texts with concurrency-limited parallel API calls.
   * Empty/whitespace-only strings are passed through unchanged.
   */
  async translateBatch(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string[]> {
    if (texts.length === 0) return [];
    const apiKey = getApiKey();

    const results: string[] = new Array(texts.length);
    let cursor = 0;

    const worker = async () => {
      while (cursor < texts.length) {
        const index = cursor++;
        if (index >= texts.length) break;
        const text = texts[index];
        if (!text.trim()) {
          results[index] = text;
          continue;
        }
        results[index] = await translateSingle(text, sourceLanguage, targetLanguage, apiKey);
      }
    };

    const concurrency = Math.min(MAX_CONCURRENT, texts.length);
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return results;
  }

  getSupportedPairs(): string[] {
    const pairs: string[] = [];
    for (const src of RIVA_LANGUAGE_CODES) {
      for (const tgt of RIVA_LANGUAGE_CODES) {
        if (src !== tgt) pairs.push(`${src} -> ${tgt}`);
      }
    }
    return pairs;
  }
}

export const nvidiaRivaTranslator = new NvidiaRivaTranslator();
