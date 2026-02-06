/**
 * Piper Narrator Provider
 *
 * Wraps the existing src/lib/tts/piper.ts implementation.
 * Uses local Piper TTS binary with ONNX models.
 */

import type { NarratorProvider, NarrateOptions, NarrateResult } from "./types";
import { synthesizeTextToWavBytes } from "@/lib/tts/piper";

const DEFAULT_VOICE = "sv_SE-nst-medium";

export class PiperNarrator implements NarratorProvider {
  readonly name = "piper";

  async narrate(options: NarrateOptions): Promise<NarrateResult> {
    const { text } = options;
    // voiceId and language are configured via env vars in piper.ts

    const audioBuffer = await synthesizeTextToWavBytes(text);

    // Estimate duration from WAV buffer (assumes standard WAV header)
    let durationSeconds: number | undefined;
    try {
      if (audioBuffer.length >= 44) {
        const byteRate = audioBuffer.readUInt32LE(28);
        if (byteRate > 0) {
          const dataSize = audioBuffer.length - 44;
          durationSeconds = Math.round(dataSize / byteRate);
        }
      }
    } catch {
      // Duration estimation failed, leave undefined
    }

    return { audioBuffer, durationSeconds };
  }

  getAvailableVoices(): string[] {
    // Currently only one voice is supported via config
    return [DEFAULT_VOICE];
  }
}

/** Default narrator instance */
export const piperNarrator = new PiperNarrator();
