import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * NVIDIA-hosted image generation for book covers.
 *
 * History: this module originally called stabilityai/stable-diffusion-3-medium,
 * but that hosted function was retired from the API catalog (the gateway now
 * returns "Function … not found for account" for every key). The gateway was
 * probed on 2026-06-09: flux.1-schnell and stable-diffusion-xl are live, the
 * 3.5 family is download-only (404 on the gateway).
 *
 * Strategy: try endpoints in order, remembering the first one that works for
 * the lifetime of the server process. Each endpoint has its own request/
 * response shape, normalized to a base64 string.
 */

const NVIDIA_TIMEOUT_MS = 150_000;
const BOOK_COVERS_BUCKET = "book_covers";

const NEGATIVE_PROMPT =
  "text, letters, words, title, typography, book, book cover, physical book, table, shelf, blurry, low quality, watermark, signature, cropped, deformed, hands, fingers";

type Endpoint = {
  label: string;
  url: string;
  buildBody: (prompt: string, seed: number) => Record<string, unknown>;
  extractImage: (data: Record<string, unknown>) => string | null;
};

function extractArtifactBase64(data: Record<string, unknown>): string | null {
  const artifacts = data.artifacts;
  if (Array.isArray(artifacts) && artifacts.length > 0) {
    const first = artifacts[0] as Record<string, unknown>;
    if (typeof first?.base64 === "string") return first.base64;
  }
  // Legacy SD3-style shape, kept as a safety net.
  if (typeof data.image === "string") return data.image;
  return null;
}

const ENDPOINTS: ReadonlyArray<Endpoint> = [
  {
    label: "flux.1-schnell",
    url: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
    buildBody: (prompt, seed) => ({
      prompt,
      mode: "base",
      seed,
      steps: 4, // schnell is a distilled 1-4 step model; 4 is its quality sweet spot
    }),
    extractImage: extractArtifactBase64,
  },
  {
    label: "stable-diffusion-xl",
    url: "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl",
    buildBody: (prompt, seed) => ({
      width: 1024,
      height: 1024,
      text_prompts: [
        { text: prompt, weight: 1 },
        { text: NEGATIVE_PROMPT, weight: -1 },
      ],
      cfg_scale: 5,
      sampler: "K_DPM_2_ANCESTRAL",
      samples: 1,
      seed,
      steps: 25,
    }),
    extractImage: extractArtifactBase64,
  },
];

/**
 * Index of the endpoint that last succeeded. Module-scoped so a warm server
 * process skips known-dead endpoints on subsequent generations.
 */
let preferredEndpointIndex = 0;

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

/** True for errors that mean "this endpoint won't work for this account or
 * request shape" — the signal to fail over to the next endpoint rather than
 * surface the error. 401 is deliberately excluded (same key everywhere, so a
 * bad key fails every endpoint and should surface immediately). */
function isEndpointUnavailableError(status: number): boolean {
  return (
    status === 404 ||
    status === 403 ||
    status === 410 ||
    status === 400 ||
    status === 422
  );
}

async function callEndpoint(
  endpoint: Endpoint,
  prompt: string,
  apiKey: string
): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NVIDIA_TIMEOUT_MS);

  try {
    const seed = Math.floor(Math.random() * 2147483647);
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(endpoint.buildBody(prompt, seed)),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      const error = new Error(
        `NVIDIA ${endpoint.label} API error ${response.status}: ${errorText}`
      ) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const image = endpoint.extractImage(data);
    if (!image) {
      throw new Error(`NVIDIA ${endpoint.label} response missing image data.`);
    }

    return Buffer.from(image, "base64");
  } finally {
    clearTimeout(timeout);
  }
}

async function generateSingleImage(
  prompt: string,
  apiKey: string
): Promise<Buffer> {
  let lastError: unknown = null;

  for (let i = preferredEndpointIndex; i < ENDPOINTS.length; i++) {
    const endpoint = ENDPOINTS[i];
    try {
      const buffer = await callEndpoint(endpoint, prompt, apiKey);
      preferredEndpointIndex = i;
      return buffer;
    } catch (error) {
      lastError = error;
      const status = (error as Error & { status?: number }).status;
      if (status !== undefined && isEndpointUnavailableError(status)) {
        // Endpoint dead for this account — try the next one.
        console.warn(
          `[cover generate] ${endpoint.label} unavailable (${status}); failing over.`
        );
        continue;
      }
      // Transient/other error — surface it (the API route retries once).
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All NVIDIA image endpoints are unavailable.");
}

/**
 * Generate 4 book cover images using NVIDIA-hosted image models
 * (flux.1-schnell with stable-diffusion-xl failover).
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
