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

/** Env-driven so a new model id never needs a deploy. */
const DEFAULT_MODEL = "gpt-6-astra";

export type OpenAiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
};

export type OpenAiCallInput = {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
  /** When set, the reply is constrained to this schema on the wire. */
  schema?: OpenAiJsonSchema;
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

export async function callOpenAi(input: OpenAiCallInput): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new OpenAiError("OPENAI_API_KEY is not set");
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
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
    }),
  });

  if (!response.ok) {
    // Never log the body: it echoes manuscript content back on some errors.
    throw new OpenAiError(`OpenAI request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as ResponsesPayload;
  if (payload.status === "incomplete") {
    throw new OpenAiError(
      `OpenAI reply was incomplete (${payload.incomplete_details?.reason ?? "unknown"})`
    );
  }
  const text = readOutputText(payload);
  if (!text) throw new OpenAiError("OpenAI returned an empty reply");
  return text;
}
