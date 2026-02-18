import type { NarratorProvider, NarrateOptions, NarrateResult } from "./types";
import { AIProviderError } from "./types";

const REMOVED_MESSAGE =
  "PIPER_REMOVED: Lokal legacy-TTS har tagits bort. Använd Qwen3 TTS istället.";

export class RemovedNarrator implements NarratorProvider {
  readonly name = "removed";

  async narrate(options: NarrateOptions): Promise<NarrateResult> {
    void options;
    throw new AIProviderError(
      REMOVED_MESSAGE,
      "PROVIDER_UNAVAILABLE",
      this.name,
    );
  }

  getAvailableVoices(): string[] {
    return [];
  }
}

export const removedNarrator = new RemovedNarrator();
