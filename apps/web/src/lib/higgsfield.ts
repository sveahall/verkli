import "server-only";
import { createHiggsfieldClient } from "@higgsfield/client/v2";

const HIGGSFIELD_ENDPOINT = "/v1/image2video/dop";
const HIGGSFIELD_MODEL = "dop-standard" as const;
// Keep headroom for provider-file download + Supabase upload within route maxDuration=180s.
const HIGGSFIELD_TIMEOUT_MS = 150_000;

type GenerateImageToVideoInput = {
  prompt: string;
  imageUrl: string;
  durationSeconds?: number;
};

type GenerateImageToVideoResult = {
  requestId: string;
  videoUrl: string;
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
