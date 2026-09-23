/**
 * Minimal OpenAI client, on the Responses API.
 *
 * No `server-only` guard: `marketing-worker.ts` reaches this through
 * `generateLaunchCopy`, and that worker is a plain tsx process, not a route.
 *
 * Deliberately a raw `fetch` rather than the `openai` SDK: every other
 * non-Anthropic vendor here (ElevenLabs, fal.ai, NVIDIA NIM) is already wired
 * this way, so an SDK would add a dependency to keep current and buy nothing.
 *
 * Responses (`/v1/responses`), not Chat Completions: it is the endpoint OpenAI
 * now points new integrations at, it separates `instructions` from `input`
 * rather than folding both into a `messages` array, and structured output
 * lives under `text.format` instead of `response_format`.
 */

import { recordUsage } from "@/lib/usage/meter";
import type { MeterContext } from "@/lib/usage/types";

/** Env-driven so a new model id never needs a deploy. */
const DEFAULT_MODEL = "gpt-6-astra";

export type OpenAiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
};

export type OpenAiUsage = {
  model: string;
  responseId: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
};

export type OpenAiCallInput = {
  /** Persist paid work before response content is validated. */
  onUsage?: (usage: OpenAiUsage) => void | Promise<void>;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
  /** When set, the reply is constrained to this schema on the wire. */
  schema?: OpenAiJsonSchema;
  /**
   * When present, token spend is billed to this user. Absent means the call is
   * not measured, which is what scripts, seeds and tests want.
   */
  meter?: MeterContext;
};

export class OpenAiError extends Error {}

/**
 * Whether the OpenAI half of a critic pass can run at all. Callers treat a
 * `false` here as "skip the critic", never as an error: the critic is an
 * enhancement, and losing it must degrade to the single-model path rather than
 * fail the author's request.
 */
export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

type ResponsesPayload = {
  id?: string;
  model?: string;
  usage?: { input_tokens: number; output_tokens: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number } };
  status?: string;
  incomplete_details?: { reason?: string };
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
};

/** The raw JSON has no `output_text`; that is an SDK convenience. Rebuild it. */
function readOutputText(payload: ResponsesPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n")
    .trim();
}

function openAiRequest(input: OpenAiCallInput) {
  return {
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    instructions: input.system,
    input: input.user,
    max_output_tokens: input.maxTokens,
    ...(input.schema
      ? {
          text: {
            format: {
              type: "json_schema",
              name: input.schema.name,
              strict: true,
              schema: input.schema.schema,
            },
          },
        }
      : {}),
  };
}

/** Conservative token units, not currency; includes all wire escaping and output/reasoning. */
export function estimateOpenAiUnits(input: OpenAiCallInput): number {
  return Buffer.byteLength(JSON.stringify(openAiRequest(input)), "utf8") + 4096 + input.maxTokens;
}

export async function callOpenAi(input: OpenAiCallInput): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new OpenAiError("OPENAI_API_KEY is not set");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(openAiRequest(input)),
  });

  if (!response.ok) {
    // Never log the body: it echoes manuscript content back on some errors.
    throw new OpenAiError(`OpenAI request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as ResponsesPayload;
  if (input.onUsage) {
    const usage = payload.usage;
    const counts = [usage?.input_tokens, usage?.output_tokens,
      usage?.input_tokens_details?.cached_tokens ?? 0, usage?.output_tokens_details?.reasoning_tokens ?? 0];
    if (!payload.model?.trim() || counts.some((count) => !Number.isSafeInteger(count) || count! < 0)
      || counts[2]! > counts[0]! || counts[3]! > counts[1]!) {
      throw new OpenAiError("OpenAI usage receipt is missing or invalid");
    }
    await input.onUsage({ model: payload.model, responseId: payload.id ?? null,
      inputTokens: counts[0]!, outputTokens: counts[1]!, cachedInputTokens: counts[2]!, reasoningTokens: counts[3]! });
  }
  if (payload.status === "incomplete") {
    throw new OpenAiError(
      `OpenAI reply was incomplete (${payload.incomplete_details?.reason ?? "unknown"})`
    );
  }
  const text = readOutputText(payload);
  if (!text) throw new OpenAiError("OpenAI returned an empty reply");

  // Measured only once the reply is known good, and never in a way that can
  // fail the call: `recordUsage` swallows its own errors by contract, because
  // the tokens are already spent and a metering problem must not also cost the
  // caller their result.
  //
  // A reply with no `usage` block gets an explicit marker row rather than a
  // pair of zeros. Zeros would be dropped as unmeasured and the gap would then
  // look identical to a user who simply spent nothing.
  if (!input.meter) return text;

  // The model the API actually ran, not the one we asked for. They differ when
  // OpenAI routes a request elsewhere, and the bill follows what ran.
  const billedModel = payload.model?.trim() || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const usage = payload.usage;
  if (usage) {
    await recordUsage(input.meter, [
      { kind: "ai_call", provider: "openai", model: billedModel, quantity: usage.input_tokens ?? 0, unit: "input_tokens" },
      { kind: "ai_call", provider: "openai", model: billedModel, quantity: usage.output_tokens ?? 0, unit: "output_tokens" },
    ]);
  } else {
    await recordUsage(input.meter, [
      {
        kind: "ai_call",
        provider: "openai",
        model: billedModel,
        quantity: 1,
        unit: "ms",
        meta: { usage_missing: true, note: "provider returned no usage block" },
      },
    ]);
  }
  return text;
}
