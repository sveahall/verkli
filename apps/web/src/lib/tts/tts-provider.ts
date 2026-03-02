/**
 * TTS Provider Interface — abstracts local (Qwen subprocess) and cloud
 * (OpenAI TTS, ElevenLabs, etc.) synthesis behind a common contract.
 *
 * The audiobook worker calls `synthesize()` regardless of backend.
 * Provider is selected via TTS_PROVIDER env var (default: "qwen-local").
 */

export type TtsSynthesisResult = {
  /** Raw WAV audio buffer */
  wav: Buffer;
  /** Sample rate in Hz (0 if unknown) */
  sampleRate: number;
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
export type TtsProviderKey = "qwen-local" | "openai";

/**
 * Resolve the active TTS provider key from env.
 * Falls back to "qwen-local" when TTS_PROVIDER is unset.
 */
export function getActiveProviderKey(): TtsProviderKey {
  const raw = (process.env.TTS_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "openai") return "openai";
  return "qwen-local";
}
