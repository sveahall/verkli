/**
 * Minimal OpenAI chat client.
 *
 * No `server-only` guard: `marketing-worker.ts` reaches this through
 * `generateLaunchCopy`, and that worker is a plain tsx process, not a route.
 *
 * Deliberately a raw `fetch` rather than the `openai` SDK: every other
 * non-Anthropic vendor in this codebase (ElevenLabs, fal.ai, NVIDIA NIM) is
 * already wired this way, and the NIM fallback in
 * `lib/marketing/launch-copy-provider.ts` is the same OpenAI-compatible
 * `chat/completions` shape. Adding an SDK would buy nothing and add a
 * dependency to keep current.
 */

/** Model is env-driven so a new model id never needs a deploy. */
const DEFAULT_MODEL = "gpt-5";

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
  temperature?: number;
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

export async function callOpenAi(input: OpenAiCallInput): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new OpenAiError("OPENAI_API_KEY is not set");
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      // `max_completion_tokens`, not `max_tokens`: the latter is rejected by
      // current reasoning-capable models. Wrong-parameter failures surface as a
      // 400 here and degrade to the single-model path, never to a broken reply.
      max_completion_tokens: input.maxTokens,
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      ...(input.schema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: input.schema.name, schema: input.schema.schema, strict: true },
            },
          }
        : {}),
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    }),
  });

  if (!response.ok) {
    // Never log the body: it echoes manuscript content back on some errors.
    throw new OpenAiError(`OpenAI request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const choice = payload.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new OpenAiError("OpenAI reply was truncated");
  }
  const text = choice?.message?.content?.trim();
  if (!text) throw new OpenAiError("OpenAI returned an empty reply");
  return text;
}
