/**
 * OpenAI TTS provider — cloud-based alternative to the local Qwen subprocess.
 *
 * Uses the OpenAI Audio Speech API (POST /v1/audio/speech).
 * Requires: OPENAI_API_KEY env var.
 *
 * Voice mapping: maps Verkli voice IDs to OpenAI voice names.
 * Returns PCM WAV audio (response_format=wav).
 */

import type { TtsProvider, TtsSynthesisOptions, TtsSynthesisResult } from "./tts-provider";

/** Map internal voice IDs to OpenAI voices */
const VOICE_MAP: Record<string, string> = {
  ryan: "onyx",
  serena: "nova",
  aiden: "echo",
  dylan: "fable",
  eric: "alloy",
  vivian: "shimmer",
  // Fallback for unmapped voices
};

/** Map language codes to OpenAI model variants */
function resolveModel(modelId: string): string {
  // Allow explicit OpenAI model override
  if (modelId.startsWith("tts-")) return modelId;
  // Default to tts-1 (fast) for audiobooks; use tts-1-hd for higher quality
  return process.env.OPENAI_TTS_MODEL ?? "tts-1";
}

function resolveVoice(voiceId: string): string {
  const lower = voiceId.toLowerCase();
  return VOICE_MAP[lower] ?? "onyx";
}

export class OpenAiTtsProvider implements TtsProvider {
  readonly name = "openai";

  async synthesize(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set — cannot use OpenAI TTS provider");
    }

    const model = resolveModel(options.modelId);
    const voice = resolveVoice(options.voiceId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          voice,
          input: text,
          response_format: "wav",
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`OpenAI TTS API error ${res.status}: ${errBody.slice(0, 300)}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const wav = Buffer.from(arrayBuffer);

      return {
        wav,
        sampleRate: 24000, // OpenAI TTS outputs 24kHz
        metadata: {
          provider: "openai",
          model,
          voice,
          inputLength: text.length,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
