import "server-only";
import { HiggsfieldClient } from "@higgsfield/client";
import { recordUsage } from "@/lib/usage/meter";
import type { MeterContext } from "@/lib/usage/types";

const HIGGSFIELD_ENDPOINT = "/v1/image2video/dop";
export const HIGGSFIELD_MODEL = "dop-turbo" as const;
// Keep headroom for provider-file download + Supabase upload within route maxDuration=180s.
const HIGGSFIELD_TIMEOUT_MS = 150_000;

type GenerateImageToVideoInput = {
  prompt: string;
  imageUrl: string;
  durationSeconds?: number;
  includeAudio?: boolean;
  /** When present, the render is billed to this user. Absent = not measured. */
  meter?: MeterContext;
};

type GenerateImageToVideoResult = {
  requestId: string;
  videoUrl: string;
};

export function assertHiggsfieldConfigured(): void {
  const credentials = process.env.HF_CREDENTIALS?.trim();
  const parts = credentials?.split(":");
  if (!parts || parts.length !== 2 || !parts.every(part => part.trim())) {
    throw new Error("HF_CREDENTIALS is missing or invalid. Expected KEY_ID:KEY_SECRET.");
  }
}

function getHiggsfieldClient() {
  assertHiggsfieldConfigured();
  const [apiKey, apiSecret] = process.env.HF_CREDENTIALS!.trim().split(":");
  // This endpoint uses the v1 params/job-set contract, not v2 subscribe.
  return new HiggsfieldClient({ apiKey, apiSecret, maxRetries: 0, maxPollTime: HIGGSFIELD_TIMEOUT_MS, timeout: 30_000 });
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
  meter,
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
    hf.generate(HIGGSFIELD_ENDPOINT, input, { withPolling: true }),
    HIGGSFIELD_TIMEOUT_MS
  );

  const requestId = result.id?.trim();
  const videoUrl = result.jobs.find(job => job.status === "completed")?.results?.raw?.url?.trim();

  if (!requestId) {
    throw new Error("Higgsfield response missing job-set ID.");
  }
  if (!videoUrl) {
    throw new Error("Higgsfield response missing video URL.");
  }

  // Video is the highest unit cost on the platform, so it is measured even
  // though one render is one row. `duration_seconds` rides in meta because
  // Higgsfield prices by length: if the price book later needs per-second
  // rates, the raw number is already recorded and history reprices.
  if (meter) {
    await recordUsage(meter, [
      {
        kind: "ai_call",
        provider: "higgsfield",
        model: HIGGSFIELD_MODEL,
        quantity: 1,
        unit: "renders",
        requestId,
        meta: { duration_seconds: durationSeconds ?? null, audio: includeAudio },
      },
    ]);
  }

  return { requestId, videoUrl };
}
