/**
 * OpenAI translator.
 *
 * Drafts book translations and, after Anthropic's critique, revises them.
 * Also the standby when Anthropic is the only configured engine. Responses API
 * via `callOpenAi`, structured as `{ "segments": string[] }`.
 */

import { getLanguageLabel, SUPPORTED_LANGUAGE_CODES } from "@/lib/languages";
import type { MeterContext } from "@/lib/usage/types";

import { callOpenAi, OpenAiError, type OpenAiJsonSchema } from "./openai";
import type { TranslatorProvider, TranslateOptions, TranslateResult } from "./types";
import { AIProviderError } from "./types";

const MAX_TOKENS = 8000;
const REQUEST_TIMEOUT_MS = 120_000;
const BATCH_SIZE = 25;
const MAX_CONCURRENT = 3;

const SEGMENT_SCHEMA: OpenAiJsonSchema = {
  name: "translation_segments",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      segments: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["segments"],
  },
};

function buildSystemPrompt(sourceLanguage: string, targetLanguage: string): string {
  return [
    `You translate literary prose from ${getLanguageLabel(sourceLanguage)} into ${getLanguageLabel(targetLanguage)}.`,
    "",
    "Rules:",
    '- Reply with a JSON object {"segments": string[]}, one string per input segment, in the same order.',
    "- The segments array length MUST equal the number of input segments. Never merge or split segments.",
    "- Translate an empty or whitespace-only segment to an empty string.",
    "- Preserve the author's voice, register and paragraph structure.",
    "- Keep proper nouns, character names and place names unchanged unless the target language has an established form.",
    "- Do not add commentary, notes, or quotation marks that are not in the source.",
  ].join("\n");
}

function parseSegments(raw: string, expected: number): string[] {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    const arrayStart = trimmed.indexOf("[");
    const arrayEnd = trimmed.lastIndexOf("]");
    const objectStart = trimmed.indexOf("{");
    const objectEnd = trimmed.lastIndexOf("}");
    const start = arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart) ? arrayStart : objectStart;
    const end = start === arrayStart ? arrayEnd : objectEnd;
    if (start === -1 || end < start) {
      throw new AIProviderError("OpenAI returned no JSON.", "MODEL_ERROR", "openai");
    }
    try {
      value = JSON.parse(trimmed.slice(start, end + 1));
    } catch (err) {
      throw AIProviderError.fromError(err, "openai");
    }
  }

  const segments = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { segments?: unknown }).segments)
      ? (value as { segments: unknown[] }).segments
      : null;

  if (!segments || !segments.every((segment) => typeof segment === "string")) {
    throw new AIProviderError("OpenAI returned a non-string array.", "MODEL_ERROR", "openai");
  }
  if (segments.length !== expected) {
    throw new AIProviderError(
      `OpenAI returned ${segments.length} segments for ${expected} inputs.`,
      "MODEL_ERROR",
      "openai"
    );
  }
  return segments as string[];
}

async function translateChunk(
  texts: string[],
  sourceLanguage: string,
  targetLanguage: string,
  meter?: MeterContext
): Promise<string[]> {
  try {
    const raw = await callOpenAi({
      system: buildSystemPrompt(sourceLanguage, targetLanguage),
      user: `Translate these ${texts.length} segments.\n\n${JSON.stringify(texts)}`,
      maxTokens: MAX_TOKENS,
      timeoutMs: REQUEST_TIMEOUT_MS,
      schema: SEGMENT_SCHEMA,
      meter,
    });
    return parseSegments(raw, texts.length);
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    if (err instanceof OpenAiError) throw AIProviderError.fromError(err, "openai");
    throw AIProviderError.fromError(err, "openai");
  }
}

export class OpenAiTranslator implements TranslatorProvider {
  readonly name = "openai";

  async translate(options: TranslateOptions): Promise<TranslateResult> {
    const [translatedText] = await this.translateBatch(
      [options.text],
      options.sourceLanguage,
      options.targetLanguage,
      options.meter
    );
    return { translatedText };
  }

  async translateBatch(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string,
    meter?: MeterContext
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const chunks: { index: number; texts: string[] }[] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      chunks.push({ index: i, texts: texts.slice(i, i + BATCH_SIZE) });
    }

    const out = new Array<string>(texts.length);
    let cursor = 0;

    const runner = async (): Promise<void> => {
      while (cursor < chunks.length) {
        const chunk = chunks[cursor++];
        const translated = await translateChunk(
          chunk.texts,
          sourceLanguage,
          targetLanguage,
          meter
        );
        translated.forEach((value, offset) => {
          out[chunk.index + offset] = value;
        });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT, chunks.length) }, runner)
    );

    return out;
  }

  getSupportedPairs(): string[] {
    return SUPPORTED_LANGUAGE_CODES.flatMap((source) =>
      SUPPORTED_LANGUAGE_CODES.filter((target) => target !== source).map(
        (target) => `${source} -> ${target}`
      )
    );
  }
}

export const openaiTranslator = new OpenAiTranslator();
