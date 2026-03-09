/**
 * TTS Provider Interface — abstracts local (Qwen subprocess) and cloud
 * (OpenAI TTS, ElevenLabs, etc.) synthesis behind a common contract.
 *
 * The audiobook worker calls `synthesize()` regardless of backend.
 * Provider is selected via TTS_PROVIDER env var (default: "qwen-local").
 */

export type TtsSynthesisResult = {
  /** Raw audio buffer */
  wav: Buffer;
  /** Sample rate in Hz (0 if unknown) */
  sampleRate: number;
  /** Encoded audio format */
  format?: "wav" | "mp3";
  /** Encoded bitrate in kbps when known */
  bitrateKbps?: number;
  /** Provider-specific metadata (device, RTF, etc.) */
  metadata: Record<string, unknown>;
};

export type TtsSynthesisOptions = {
  language: string;
  voiceId: string;
  /** Provider-specific model identifier */
  modelId: string;
  /** Timeout in ms for this synthesis call */
  timeoutMs: number;
};

export interface TtsProvider {
  /** Human-readable provider name for logs */
  readonly name: string;
  /** Synthesize text to WAV audio */
  synthesize(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult>;
}

/** Supported provider keys */
export type TtsProviderKey = "qwen-local" | "openai" | "elevenlabs";

export function assertElevenLabsEnv(): void {
  const missing: string[] = [];
  if (!(process.env.ELEVENLABS_API_KEY ?? "").trim()) missing.push("ELEVENLABS_API_KEY");
  if (!(process.env.ELEVENLABS_VOICE_ID ?? "").trim()) missing.push("ELEVENLABS_VOICE_ID");
  if (missing.length > 0) {
    throw new Error(`Missing required env for elevenlabs provider: ${missing.join(", ")}`);
  }
}

/**
 * Resolve the active TTS provider key from env.
 * Falls back to "qwen-local" when TTS_PROVIDER is unset.
 */
export function getActiveProviderKey(): TtsProviderKey {
  const raw = (process.env.TTS_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "elevenlabs") {
    assertElevenLabsEnv();
    return "elevenlabs";
  }
  if (raw === "openai") return "openai";
  return "qwen-local";
}
