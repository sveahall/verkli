import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Book cover generation via fal.ai (FLUX.1 [schnell]).
 *
 * Replaces the NVIDIA-hosted implementation, which stopped working in a way
 * worth recording: `stable-diffusion-xl` began returning
 * `404 Function not found for account`, and `flux.1-schnell` accepted the
 * connection then never responded — verified by hand at 170s with both of the
 * account's keys. The route's own retry turned that into a >300s hang, which
 * Vercel killed at its function limit, so the author saw a spinner that never
 * resolved and no error anywhere.
 *
 * Two design consequences of that failure:
 *
 *   1. NO PROVIDER FAILOVER. A fallback that hangs is worse than no fallback:
 *      it multiplies the time-to-failure and hides the real cause. One
 *      provider, one code path, and a fast loud error when it breaks.
 *
 *   2. The timeout is set below the platform's function limit, not above it.
 *      The old code allowed 150s per attempt on a platform that kills the
 *      function at 60, so a provider hang always presented as a dead request
 *      rather than a handled failure.
 */

const FAL_ENDPOINT = "https://fal.run/fal-ai/flux/schnell";

/**
 * Comfortably inside Vercel's function limit, so a slow provider surfaces as
 * our error with our message rather than as a killed function. schnell is a
 * 1-4 step distilled model and normally answers in seconds; if it takes 40,
 * something is wrong and waiting longer will not fix it.
 */
const FAL_TIMEOUT_MS = 40_000;

/** 2:3 portrait — the cover panel asks for 1600x2400, same ratio. */
const IMAGE_WIDTH = 1024;
const IMAGE_HEIGHT = 1536;

const COVER_COUNT = 4;
const BOOK_COVERS_BUCKET = "book_covers";

type GenerateCoverImagesInput = {
  prompt: string;
};

type GenerateCoverImagesResult = {
  requestId: string;
  imageUrls: string[];
};

type FalImage = {
  url?: unknown;
  content_type?: unknown;
};

function getFalKey(): string {
  const key = process.env.FAL_KEY?.trim();
  if (!key) {
    throw new Error("FAL_KEY is missing.");
  }
  return key;
}

/**
 * One image per request, four requests in parallel.
 *
 * `num_images: 4` is the obvious call and it is the wrong one: fal generates
 * them sequentially. Measured against this account, same prompt and size —
 * one request for four images takes 32s, four parallel requests take 11s.
 *
 * That difference decides whether this fits. The platform kills the function
 * at 60s, and the four downloads and four storage uploads below still have to
 * happen after generation finishes.
 */
async function requestOneImage(prompt: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FAL_TIMEOUT_MS);

  try {
    const response = await fetch(FAL_ENDPOINT, {
      method: "POST",
      headers: {
        // fal uses `Key`, not `Bearer`.
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_size: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
        num_images: 1,
        num_inference_steps: 4,
        // The storage upload below writes image/png; asking for png keeps the
        // declared content type honest rather than mislabelling a JPEG.
        output_format: "png",
        enable_safety_checker: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "unknown");
      throw new Error(`fal.ai error ${response.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await response.json()) as { images?: unknown };
    const images = Array.isArray(data.images) ? (data.images as FalImage[]) : [];
    const url = images.find((image) => typeof image?.url === "string")?.url;

    if (typeof url !== "string") {
      throw new Error("fal.ai returned no image.");
    }

    return url;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`fal.ai did not respond within ${FAL_TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * fal's URLs are temporary. The cover has to survive in our own storage, so
 * each image is fetched once and re-uploaded — the same thing the NVIDIA
 * implementation did with base64 buffers, just starting from a URL.
 */
async function downloadImage(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to download generated image (${response.status}).`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate book cover options and return public URLs in our own storage.
 *
 * The signature is unchanged from the NVIDIA implementation so the route, its
 * tests and the UI are untouched by the provider swap.
 */
export async function generateCoverImages({
  prompt,
}: GenerateCoverImagesInput): Promise<GenerateCoverImagesResult> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required for cover generation.");
  }

  const apiKey = getFalKey();
  const requestId = crypto.randomUUID();

  const sourceUrls = await Promise.all(
    Array.from({ length: COVER_COUNT }, () => requestOneImage(trimmedPrompt, apiKey))
  );
  const buffers = await Promise.all(sourceUrls.map(downloadImage));

  const admin = createAdminClient();
  const imageUrls = await Promise.all(
    buffers.map(async (buffer, index) => {
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

  return { requestId, imageUrls };
}
