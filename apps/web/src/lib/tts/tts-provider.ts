/**
 * TTS Provider Interface — ElevenLabs is the sole TTS backend.
 *
 * The audiobook worker calls `synthesize()` on the provider.
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
  /** Synthesize text to audio */
  synthesize(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult>;
}

export function assertElevenLabsEnv(): void {
  const missing: string[] = [];
  if (!(process.env.ELEVENLABS_API_KEY ?? "").trim()) missing.push("ELEVENLABS_API_KEY");
  if (!(process.env.ELEVENLABS_VOICE_ID ?? "").trim()) missing.push("ELEVENLABS_VOICE_ID");
  if (missing.length > 0) {
    throw new Error(`Missing required env for elevenlabs provider: ${missing.join(", ")}`);
  }
}
