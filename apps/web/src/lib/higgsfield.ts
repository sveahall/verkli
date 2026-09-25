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
  requestId?: string;
  onSubmitted?: (requestId: string) => Promise<void>;
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

export class HiggsfieldPendingError extends Error {
  constructor(public readonly requestId: string) {
    super("The trailer is still processing. Check the same render again shortly.");
    this.name = "HiggsfieldPendingError";
  }
}

async function pollVideo(requestId: string): Promise<string> {
  const [key, secret] = process.env.HF_CREDENTIALS!.trim().split(":");
  const deadline = Date.now() + HIGGSFIELD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    let response: Response;
    try {
      response = await fetch(`https://platform.higgsfield.ai/v1/job-sets/${encodeURIComponent(requestId)}`, {
        headers: { "hf-api-key": key, "hf-secret": secret },
        signal: AbortSignal.timeout(Math.min(30_000, Math.max(1, deadline - Date.now()))),
      });
    } catch { throw new HiggsfieldPendingError(requestId); }
    // A failed status read is not evidence that the paid render failed.
    if (!response.ok) throw new HiggsfieldPendingError(requestId);
    const result = await response.json().catch(() => { throw new HiggsfieldPendingError(requestId); }) as { jobs?: { status: string; results?: { raw?: { url?: string } } }[] };
    const completed = result.jobs?.find(job => job.status === "completed");
    if (completed?.results?.raw?.url) return completed.results.raw.url;
    if (result.jobs?.some(job => ["failed", "nsfw", "canceled"].includes(job.status))) {
      throw new Error("Higgsfield could not complete this trailer. Review the cover and try again.");
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(2_000, Math.max(0, deadline - Date.now()))));
  }
  throw new HiggsfieldPendingError(requestId);
}

export async function generateImageToVideo({
  prompt,
  imageUrl,
  durationSeconds,
  includeAudio = true,
  meter,
  requestId: existingRequestId,
  onSubmitted,
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

  const requestId = existingRequestId ?? (await hf.generate(HIGGSFIELD_ENDPOINT, input, { withPolling: false })).id?.trim();
  if (!requestId) throw new Error("Higgsfield response missing job-set ID.");
  if (!existingRequestId) {
    // Save before waiting: the provider can finish after this HTTP request ends.
    await onSubmitted?.(requestId);
  }

  // Video is the highest unit cost on the platform, so it is measured even
  // though one render is one row. `duration_seconds` rides in meta because
  // Higgsfield prices by length: if the price book later needs per-second
  // rates, the raw number is already recorded and history reprices.
  if (meter && !existingRequestId) {
    await recordUsage(meter, [
      {
        kind: "ai_call",
        provider: "higgsfield",
        model: HIGGSFIELD_MODEL,
        quantity: 1,
        unit: "renders",
        requestId,
        meta: { duration_seconds: durationSeconds ?? null, audio: includeAudio, submitted: true },
      },
    ]);
  }

  const videoUrl = await pollVideo(requestId);
  return { requestId, videoUrl };
}
