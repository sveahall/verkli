import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const NVIDIA_API_URL =
  "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium";
const NVIDIA_TIMEOUT_MS = 150_000;

/** Portrait book cover: 1024x1536 (2:3 ratio, multiples of 64). */
const COVER_WIDTH = 1024;
const COVER_HEIGHT = 1536;
const BOOK_COVERS_BUCKET = "book_covers";

type GenerateCoverImagesInput = {
  prompt: string;
};

type GenerateCoverImagesResult = {
  requestId: string;
  imageUrls: string[];
};

function getNvidiaApiKey(): string {
  const key = process.env.NVIDIA_SD3_API_KEY?.trim();
  if (!key) {
    throw new Error("NVIDIA_SD3_API_KEY is missing.");
  }
  return key;
}

async function generateSingleImage(
  prompt: string,
  apiKey: string
): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NVIDIA_TIMEOUT_MS);

  try {
    const response = await fetch(NVIDIA_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        prompt,
        negative_prompt:
          "blurry, low quality, distorted text, watermark, signature, cropped, deformed",
        cfg_scale: 7,
        height: COVER_HEIGHT,
        width: COVER_WIDTH,
        steps: 40,
        seed: 0,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      throw new Error(
        `NVIDIA SD3 API error ${response.status}: ${errorText}`
      );
    }

    const data = (await response.json()) as {
      image?: string;
      finish_reason?: string;
    };
    if (!data.image) {
      throw new Error("NVIDIA SD3 response missing image data.");
    }

    return Buffer.from(data.image, "base64");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate 4 book cover images using NVIDIA Stable Diffusion 3 Medium.
 * Images are uploaded to Supabase storage and public URLs are returned.
 */
export async function generateCoverImages({
  prompt,
}: GenerateCoverImagesInput): Promise<GenerateCoverImagesResult> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required for cover generation.");
  }

  const apiKey = getNvidiaApiKey();
  const requestId = crypto.randomUUID();

  // Generate 4 images in parallel
  const imageBuffers = await Promise.all(
    Array.from({ length: 4 }, () =>
      generateSingleImage(trimmedPrompt, apiKey)
    )
  );

  // Upload to Supabase storage (admin bypasses RLS)
  const admin = createAdminClient();
  const imageUrls = await Promise.all(
    imageBuffers.map(async (buffer, index) => {
      const path = `ai-generated/${requestId}/${index}.png`;
      const { error } = await admin.storage
        .from(BOOK_COVERS_BUCKET)
        .upload(path, buffer, {
          contentType: "image/png",
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        throw new Error(
          `Failed to upload generated cover ${index}: ${error.message}`
        );
      }

      const {
        data: { publicUrl },
      } = admin.storage.from(BOOK_COVERS_BUCKET).getPublicUrl(path);

      return publicUrl;
    })
  );

  if (imageUrls.length < 4) {
    throw new Error("Failed to generate all cover images.");
  }

  return { requestId, imageUrls: imageUrls.slice(0, 4) };
}
