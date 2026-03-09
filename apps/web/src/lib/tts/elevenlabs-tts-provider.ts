import type { TtsProvider, TtsSynthesisOptions, TtsSynthesisResult } from "./tts-provider";

const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

function resolveOutputFormat(): string {
  return (process.env.ELEVENLABS_OUTPUT_FORMAT ?? "").trim() || DEFAULT_OUTPUT_FORMAT;
}

function resolveModel(modelId: string): string {
  return modelId.trim() || (process.env.ELEVENLABS_MODEL_ID ?? "").trim() || DEFAULT_MODEL_ID;
}

function parseFormat(outputFormat: string): { format: "mp3" | "wav"; bitrateKbps?: number } {
  const raw = outputFormat.toLowerCase();
  if (raw.startsWith("mp3")) {
    const match = raw.match(/^mp3_\d+_(\d+)$/);
    const bitrate = match ? Number.parseInt(match[1], 10) : NaN;
    return {
      format: "mp3",
      bitrateKbps: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : undefined,
    };
  }
  return { format: "wav" };
}

export class ElevenLabsTtsProvider implements TtsProvider {
  readonly name = "elevenlabs";

  async synthesize(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult> {
    const apiKey = (process.env.ELEVENLABS_API_KEY ?? "").trim();
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY is not set — cannot use ElevenLabs TTS provider");
    }

    const fallbackVoice = (process.env.ELEVENLABS_VOICE_ID ?? "").trim();
    const voiceId = options.voiceId.trim() || fallbackVoice;
    if (!voiceId) {
      throw new Error("ELEVENLABS_VOICE_ID is not set — cannot use ElevenLabs TTS provider");
    }

    const modelId = resolveModel(options.modelId);
    const outputFormat = resolveOutputFormat();
    const { format, bitrateKbps } = parseFormat(outputFormat);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: format === "mp3" ? "audio/mpeg" : "audio/wav",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          output_format: outputFormat,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`ElevenLabs TTS API error ${res.status}: ${errBody.slice(0, 300)}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        throw new Error("ElevenLabs TTS returned empty audio response");
      }

      return {
        wav: Buffer.from(arrayBuffer),
        sampleRate: 0,
        format,
        bitrateKbps,
        metadata: {
          provider: "elevenlabs",
          model: modelId,
          voice: voiceId,
          outputFormat,
          inputLength: text.length,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
