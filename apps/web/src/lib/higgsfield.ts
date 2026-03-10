import "server-only";
import { BatchSize, createHiggsfieldClient, SoulQuality, SoulSize } from "@higgsfield/client/v2";

const HIGGSFIELD_ENDPOINT = "/v1/image2video/dop";
const HIGGSFIELD_TEXT_TO_IMAGE_ENDPOINT = "/v1/text2image/soul";
const HIGGSFIELD_MODEL = "dop-standard" as const;
// Keep headroom for provider-file download + Supabase upload within route maxDuration=180s.
const HIGGSFIELD_TIMEOUT_MS = 150_000;

type GenerateImageToVideoInput = {
  prompt: string;
  imageUrl: string;
  durationSeconds?: number;
  includeAudio?: boolean;
};

type GenerateImageToVideoResult = {
  requestId: string;
  videoUrl: string;
};

type GenerateCoverImagesInput = {
  prompt: string;
};

type GenerateCoverImagesResult = {
  requestId: string;
  imageUrls: string[];
};

let hfClient: ReturnType<typeof createHiggsfieldClient> | null = null;

function getHiggsfieldClient() {
  if (hfClient) return hfClient;

  const credentials = process.env.HF_CREDENTIALS?.trim();
  if (!credentials) {
    throw new Error("HF_CREDENTIALS is missing. Expected KEY_ID:KEY_SECRET.");
  }
  if (!credentials.includes(":")) {
    throw new Error("HF_CREDENTIALS format is invalid. Expected KEY_ID:KEY_SECRET.");
  }

  hfClient = createHiggsfieldClient({ credentials });
  return hfClient;
}

function timeoutError(ms: number): Error {
  return new Error(`[marketing video generate] Higgsfield request timed out after ${ms}ms.`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function generateImageToVideo({
  prompt,
  imageUrl,
  durationSeconds,
  includeAudio = true,
}: GenerateImageToVideoInput): Promise<GenerateImageToVideoResult> {
  const trimmedPrompt = prompt.trim();
  const trimmedImageUrl = imageUrl.trim();

  if (!trimmedPrompt) {
    throw new Error("Prompt is required for Higgsfield image-to-video.");
  }
  if (!trimmedImageUrl) {
    throw new Error("imageUrl is required for Higgsfield image-to-video.");
  }

  const hf = getHiggsfieldClient();
  const input: Record<string, unknown> = {
    model: HIGGSFIELD_MODEL,
    prompt: trimmedPrompt,
    input_images: [{ type: "image_url", image_url: trimmedImageUrl }],
  };
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
    input.duration = durationSeconds;
  }
  input.audio = includeAudio;

  const result = await withTimeout(
    hf.subscribe(HIGGSFIELD_ENDPOINT, {
      input,
      withPolling: true,
    }),
    HIGGSFIELD_TIMEOUT_MS
  );

  const requestId = result.request_id?.trim();
  const videoUrl = result.video?.url?.trim();

  if (!requestId) {
    throw new Error("Higgsfield response missing request_id.");
  }
  if (!videoUrl) {
    throw new Error("Higgsfield response missing video URL.");
  }

  return { requestId, videoUrl };
}

export async function generateCoverImages({
  prompt,
}: GenerateCoverImagesInput): Promise<GenerateCoverImagesResult> {
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    throw new Error("Prompt is required for Higgsfield cover generation.");
  }

  const hf = getHiggsfieldClient();
  const result = await withTimeout(
    hf.subscribe(HIGGSFIELD_TEXT_TO_IMAGE_ENDPOINT, {
      input: {
        prompt: trimmedPrompt,
        width_and_height: SoulSize.PORTRAIT_1344x2016,
        quality: SoulQuality.HD,
        batch_size: BatchSize.QUAD,
        enhance_prompt: true,
      },
      withPolling: true,
    }),
    HIGGSFIELD_TIMEOUT_MS
  );

  const requestId = result.request_id?.trim();
  const imageUrls = Array.isArray(result.images)
    ? result.images
        .map((image) => image.url?.trim())
        .filter((url): url is string => Boolean(url))
    : [];

  if (!requestId) {
    throw new Error("Higgsfield response missing request_id.");
  }
  if (imageUrls.length < 4) {
    throw new Error("Higgsfield response missing generated images.");
  }

  return { requestId, imageUrls: imageUrls.slice(0, 4) };
}
