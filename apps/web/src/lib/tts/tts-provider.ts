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

/**
 * Resolve the narrator voice from deployment config, or null when unconfigured.
 *
 * There is deliberately no hardcoded default: the old "Ryan" fallback was a Qwen
 * speaker name left behind by a deleted TTS stack, and ElevenLabs rejects it with
 * a 4xx, so every unconfigured deployment charged the author and then failed at
 * the first chapter. Returning null lets callers refuse up front.
 *
 * Checked in order, first non-blank wins; `??` is not enough because an env var
 * set to the empty string must fall through to the next candidate.
 *
 * Lives here rather than in a route so the audiobook *checkout* route and the
 * *generate* route cannot drift: the checkout route has to refuse for the same
 * reasons, and it runs before any money moves.
 */
export function resolveNarratorVoiceId(): string | null {
  for (const candidate of [process.env.ELEVENLABS_VOICE_ID, process.env.TTS_VOICE_ID]) {
    const trimmed = (candidate ?? "").trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Fail fast when the ElevenLabs provider cannot possibly synthesize.
 *
 * `resolvedVoiceId` is the voice the caller already resolved — the worker
 * resolves `ELEVENLABS_VOICE_ID || payload.voiceId`, and the generate route
 * accepts `ELEVENLABS_VOICE_ID` or `TTS_VOICE_ID` and persists the winner onto
 * the job. Asserting on the env var alone contradicted both: a deployment with
 * only `TTS_VOICE_ID` set passed the route's preflight, charged the author,
 * queued the job, and then threw here before synthesis. Pass the resolved voice
 * and the env var stops being the only accepted source.
 *
 * Called with no argument the check is unchanged, so callers that have not
 * resolved a voice yet still require `ELEVENLABS_VOICE_ID`.
 */
export function assertElevenLabsEnv(resolvedVoiceId?: string | null): void {
  const missing: string[] = [];
  if (!(process.env.ELEVENLABS_API_KEY ?? "").trim()) missing.push("ELEVENLABS_API_KEY");
  if (!(resolvedVoiceId ?? "").trim() && !(process.env.ELEVENLABS_VOICE_ID ?? "").trim()) {
    missing.push("ELEVENLABS_VOICE_ID");
  }
  if (missing.length > 0) {
    throw new Error(`Missing required env for elevenlabs provider: ${missing.join(", ")}`);
  }
}
