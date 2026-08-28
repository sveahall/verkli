/**
 * Anthropic translator.
 *
 * Exists because the two providers that came before it cannot serve a Swedish
 * book, which is the only kind of book on the platform today:
 *
 *   - Opus MT is local CTranslate2. It needs a Python venv and a downloaded
 *     `model.bin` that is not in the repo (only the vocab and the two .spm
 *     files are), so it throws before translating anything — on a laptop and
 *     in a container alike.
 *   - NVIDIA Riva is alive and good, but its language set is
 *     en/de/es/fr/pt/ru/zh/ja/ko/ar. Swedish is not in it, which is why the
 *     routing table sends sv pairs through Opus or through a two-hop chain
 *     that still starts at Opus.
 *
 * This provider needs no models and no Python, translates sv directly rather
 * than via English, and reuses the key the writing assistant already uses.
 *
 * Riva keeps the pairs it already handles: it is cheaper per token and those
 * pairs work today. This is the provider for everything Riva cannot reach.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { TranslatorProvider, TranslateOptions, TranslateResult } from "./types";
import { AIProviderError } from "./types";

const MODEL_ID = "claude-sonnet-5";
const MAX_TOKENS = 8000;
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Paragraphs per request. Chapters arrive as many short strings, and one
 * request per paragraph would be both slow and worse: the model cannot keep a
 * character's voice consistent across calls it cannot see.
 */
const BATCH_SIZE = 25;

/** Concurrent requests, so a long chapter does not serialise into minutes. */
const MAX_CONCURRENT = 3;

const LANGUAGE_NAMES: Record<string, string> = {
  ar: "Arabic",
  da: "Danish",
  de: "German",
  en: "English",
  es: "Spanish",
  fi: "Finnish",
  fr: "French",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  nl: "Dutch",
  no: "Norwegian",
  pl: "Polish",
  pt: "Portuguese",
  ru: "Russian",
  sv: "Swedish",
  zh: "Chinese",
};

function languageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code;
}

export const ANTHROPIC_TRANSLATOR_LANGUAGES = Object.keys(LANGUAGE_NAMES);

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AIProviderError(
      "ANTHROPIC_API_KEY is not set.",
      "PROVIDER_UNAVAILABLE",
      "anthropic"
    );
  }
  return new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 2 });
}

function buildSystemPrompt(sourceLanguage: string, targetLanguage: string): string {
  return [
    `You translate literary prose from ${languageName(sourceLanguage)} into ${languageName(targetLanguage)}.`,
    "",
    "Rules:",
    `- Return ONLY a JSON array of strings, one per input segment, in the same order.`,
    "- The array length MUST equal the number of input segments. Never merge or split segments.",
    "- Translate an empty or whitespace-only segment to an empty string.",
    "- Preserve the author's voice, register and paragraph structure.",
    "- Keep proper nouns, character names and place names unchanged unless the target language has an established form.",
    "- Do not add commentary, notes, or quotation marks that are not in the source.",
  ].join("\n");
}

/**
 * The model is asked for a JSON array, but a wrapper sentence or a code fence
 * still shows up occasionally. Recover the array rather than failing a whole
 * chapter over punctuation.
 */
function parseSegments(raw: string, expected: number): string[] {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new AIProviderError(
      "Anthropic returned no JSON array.",
      "MODEL_ERROR",
      "anthropic"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  } catch (err) {
    throw AIProviderError.fromError(err, "anthropic");
  }

  if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === "string")) {
    throw new AIProviderError(
      "Anthropic returned a non-string array.",
      "MODEL_ERROR",
      "anthropic"
    );
  }

  // A length mismatch would silently shift every later paragraph onto the
  // wrong source text, so it fails loudly instead.
  if (parsed.length !== expected) {
    throw new AIProviderError(
      `Anthropic returned ${parsed.length} segments for ${expected} inputs.`,
      "MODEL_ERROR",
      "anthropic"
    );
  }

  return parsed as string[];
}

async function translateChunk(
  texts: string[],
  sourceLanguage: string,
  targetLanguage: string,
  client: Anthropic
): Promise<string[]> {
  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(sourceLanguage, targetLanguage),
    messages: [
      {
        role: "user",
        content: `Translate these ${texts.length} segments. Reply with a JSON array of ${texts.length} strings.\n\n${JSON.stringify(texts)}`,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return parseSegments(text, texts.length);
}

export class AnthropicTranslator implements TranslatorProvider {
  readonly name = "anthropic";

  async translate(options: TranslateOptions): Promise<TranslateResult> {
    const [translatedText] = await this.translateBatch(
      [options.text],
      options.sourceLanguage,
      options.targetLanguage
    );
    return { translatedText };
  }

  async translateBatch(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const client = getClient();

    const chunks: { index: number; texts: string[] }[] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      chunks.push({ index: i, texts: texts.slice(i, i + BATCH_SIZE) });
    }

    const out = new Array<string>(texts.length);
    let cursor = 0;

    const runner = async (): Promise<void> => {
      while (cursor < chunks.length) {
        const chunk = chunks[cursor++];
        try {
          const translated = await translateChunk(
            chunk.texts,
            sourceLanguage,
            targetLanguage,
            client
          );
          translated.forEach((value, offset) => {
            out[chunk.index + offset] = value;
          });
        } catch (err) {
          throw AIProviderError.fromError(err, this.name);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT, chunks.length) }, runner)
    );

    return out;
  }

  getSupportedPairs(): string[] {
    return ANTHROPIC_TRANSLATOR_LANGUAGES.flatMap((source) =>
      ANTHROPIC_TRANSLATOR_LANGUAGES.filter((target) => target !== source).map(
        (target) => `${source} -> ${target}`
      )
    );
  }
}

export const anthropicTranslator = new AnthropicTranslator();
