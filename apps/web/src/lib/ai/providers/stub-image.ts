import type { ImageProvider, ImageGenerateOptions, ImageGenerateResult } from "./types";

/**
 * Stub image provider — returns null URL, never writes to storage.
 * Used when no real image provider (e.g. DALL-E, Midjourney) is configured.
 */
export class StubImageProvider implements ImageProvider {
  readonly name = "stub-image";

  async generate(options: ImageGenerateOptions): Promise<ImageGenerateResult> {
    const width = options.width ?? 1024;
    const height = options.height ?? 1024;

    return {
      imageUrl: null,
      width,
      height,
    };
  }

  getSupportedStyles(): string[] {
    return ["default"];
  }
}

export const stubImage = new StubImageProvider();
