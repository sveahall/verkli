/**
 * Runway Video Provider
 *
 * Wraps the existing src/lib/ai/textToVideo.ts implementation.
 * Uses Runway ML API for text-to-video generation.
 */

import type { VideoProvider, VideoGenerateOptions, VideoGenerateResult } from "./types";
import { makeVideo, type TextToVideoOptions } from "@/lib/ai/textToVideo";

export class RunwayVideoProvider implements VideoProvider {
  readonly name = "runway";

  async generate(options: VideoGenerateOptions): Promise<VideoGenerateResult> {
    const { promptText, duration, aspectRatio, audio } = options;

    // Map generic options to Runway-specific options
    const runwayOptions: TextToVideoOptions = {
      promptText,
      duration: this.mapDuration(duration),
      ratio: this.mapRatio(aspectRatio),
      audio,
    };

    const result = await makeVideo(runwayOptions);

    return { output: result.output };
  }

  private mapDuration(duration?: number): 4 | 6 | 8 {
    if (duration === 4 || duration === 6 || duration === 8) {
      return duration;
    }
    return 6; // default
  }

  private mapRatio(ratio?: string): TextToVideoOptions["ratio"] {
    const validRatios = ["1280:720", "720:1280", "1080:1920", "1920:1080"] as const;
    if (ratio && validRatios.includes(ratio as typeof validRatios[number])) {
      return ratio as typeof validRatios[number];
    }
    return "1280:720"; // default
  }
}

/** Default video provider instance */
export const runwayVideo = new RunwayVideoProvider();
