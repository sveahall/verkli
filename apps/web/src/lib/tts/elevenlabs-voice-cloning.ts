// ElevenLabs voice cloning helpers (Phase 1.1).
//
// Wraps three Voice Cloning endpoints:
//   POST /v1/voices/add        — Instant Voice Cloning from a sample buffer
//   GET  /v1/voices/<voice_id> — fetch metadata
//   DELETE /v1/voices/<voice_id> — required for GDPR right-to-erasure
//
// Plus per-voice synthesis with timestamps:
//   POST /v1/text-to-speech/<voice_id>/with-timestamps
//
// All calls bound by ELEVENLABS_API_TIMEOUT_MS (default 60s). Errors surface
// the response body's first 300 chars for debugging without leaking secrets.

const API_BASE = "https://api.elevenlabs.io";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MODEL = "eleven_multilingual_v2";

function getApiKey(): string {
  const key = (process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }
  return key;
}

function getTimeoutMs(): number {
  const env = Number.parseInt(process.env.ELEVENLABS_API_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TIMEOUT_MS;
}

async function elevenLabsFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number; expectJson?: boolean } = {}
): Promise<Response> {
  const apiKey = getApiKey();
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), init.timeoutMs ?? getTimeoutMs());

  try {
    const headers = new Headers(init.headers ?? {});
    headers.set("xi-api-key", apiKey);
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `ElevenLabs ${init.method ?? "GET"} ${path} → ${res.status}: ${body.slice(0, 300)}`
      );
    }
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

export type CloneVoiceInput = {
  /** Author-chosen display name. ElevenLabs caps at 100 chars. */
  name: string;
  /** Optional free-form description. */
  description?: string;
  /** Audio sample bytes. Should be ≥ 1 minute, ≤ 25MB total. */
  sampleBuffer: Buffer;
  /** Filename for the upload. Used by ElevenLabs to detect format. */
  sampleFilename: string;
  /** MIME type of the sample. */
  sampleContentType: string;
  /** Optional labels (accent, tone, etc.). */
  labels?: Record<string, string>;
};

export type ClonedVoice = {
  voiceId: string;
  name: string;
  description: string | null;
  preview_url: string | null;
};

/**
 * POST /v1/voices/add — Instant Voice Cloning. Returns the new voice_id.
 *
 * @throws if the API key is missing, the sample is rejected, or the request
 * exceeds the timeout.
 */
export async function cloneVoiceFromSample(input: CloneVoiceInput): Promise<ClonedVoice> {
  const form = new FormData();
  form.set("name", input.name.slice(0, 100));
  if (input.description) form.set("description", input.description.slice(0, 500));
  if (input.labels) form.set("labels", JSON.stringify(input.labels));
  form.set(
    "files",
    new Blob([new Uint8Array(input.sampleBuffer)], { type: input.sampleContentType }),
    input.sampleFilename
  );

  const res = await elevenLabsFetch("/v1/voices/add", {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { voice_id?: unknown; name?: unknown; description?: unknown; preview_url?: unknown };
  if (typeof data.voice_id !== "string" || !data.voice_id) {
    throw new Error("ElevenLabs /v1/voices/add returned no voice_id");
  }
  return {
    voiceId: data.voice_id,
    name: typeof data.name === "string" ? data.name : input.name,
    description: typeof data.description === "string" ? data.description : null,
    preview_url: typeof data.preview_url === "string" ? data.preview_url : null,
  };
}

/**
 * DELETE /v1/voices/<voice_id> — required for GDPR right-to-erasure when an
 * author deletes a cloned voice or their account.
 */
export async function deleteVoice(voiceId: string): Promise<void> {
  await elevenLabsFetch(`/v1/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
  });
}

export type WordTimestamp = {
  word: string;
  start: number;
  end: number;
};

export type TtsWithTimestampsResult = {
  audio: Buffer;
  words: WordTimestamp[];
  durationMs: number | null;
};

/**
 * POST /v1/text-to-speech/<voice_id>/with-timestamps — synthesize audio AND
 * receive per-word/per-character timestamps. The character timestamps are
 * grouped into word boundaries client-side so the karaoke render layer can
 * highlight whole tokens at a time.
 *
 * The endpoint returns base64-encoded audio + timestamps in JSON.
 */
export async function synthesizeWithTimestamps(args: {
  voiceId: string;
  text: string;
  modelId?: string;
}): Promise<TtsWithTimestampsResult> {
  const res = await elevenLabsFetch(
    `/v1/text-to-speech/${encodeURIComponent(args.voiceId)}/with-timestamps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: args.text,
        model_id: args.modelId ?? DEFAULT_MODEL,
        output_format: "mp3_44100_128",
      }),
    }
  );

  type CharBlock = {
    characters?: string[];
    character_start_times_seconds?: number[];
    character_end_times_seconds?: number[];
  };
  const json = (await res.json()) as {
    audio_base64?: string;
    alignment?: CharBlock;
    normalized_alignment?: CharBlock;
  };

  if (typeof json.audio_base64 !== "string" || !json.audio_base64) {
    throw new Error("ElevenLabs with-timestamps returned no audio_base64");
  }
  const audio = Buffer.from(json.audio_base64, "base64");

  const block = json.normalized_alignment ?? json.alignment ?? null;
  const words = block ? groupCharsIntoWords(block) : [];
  const lastWord = words[words.length - 1];
  const durationMs = lastWord ? Math.round(lastWord.end * 1000) : null;

  return { audio, words, durationMs };
}

/**
 * Group ElevenLabs character-level timing into word-level timing.
 * Spaces and most punctuation flush the current word; word boundaries are
 * preserved so each entry corresponds to a token the karaoke layer can
 * highlight.
 */
export function groupCharsIntoWords(block: {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
}): WordTimestamp[] {
  const chars = block.characters ?? [];
  const starts = block.character_start_times_seconds ?? [];
  const ends = block.character_end_times_seconds ?? [];
  const words: WordTimestamp[] = [];
  let buffer = "";
  let wordStart: number | null = null;
  let lastEnd = 0;
  const isWordChar = (c: string) => /\p{L}|\p{N}|['’\-]/u.test(c);

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? "";
    const s = Number(starts[i] ?? 0);
    const e = Number(ends[i] ?? 0);
    if (isWordChar(c)) {
      if (wordStart === null) wordStart = s;
      buffer += c;
      lastEnd = e;
    } else if (buffer) {
      words.push({ word: buffer, start: wordStart ?? lastEnd, end: lastEnd });
      buffer = "";
      wordStart = null;
    }
  }
  if (buffer) {
    words.push({ word: buffer, start: wordStart ?? lastEnd, end: lastEnd });
  }
  return words;
}
