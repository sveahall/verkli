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
  includeAudio?: boolean;
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

const HIGGSFIELD_ORIGIN = "https://platform.higgsfield.ai";
const POLL_INTERVAL_MS = 2_000;

export type HiggsfieldJob = {
  status?: string;
  request_id?: string;
  status_url?: string;
  cancel_url?: string;
  video?: { url?: string };
};

function timeoutError(ms: number): Error {
  return new Error(`[marketing video generate] Higgsfield request timed out after ${ms}ms.`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Only call status and cancel URLs the provider host actually owns. */
export function isHiggsfieldHttpsUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === HIGGSFIELD_ORIGIN;
  } catch {
    return false;
  }
}

async function cancelHiggsfieldJob(
  cancelUrl: string | undefined,
  fetchImpl: typeof fetch,
  authorization: string
): Promise<void> {
  if (!isHiggsfieldHttpsUrl(cancelUrl)) return;
  try {
    // Same shape as the fal queue API this client mirrors: cancel is a PUT.
    await fetchImpl(cancelUrl, {
      method: "PUT",
      headers: { Authorization: authorization },
    });
  } catch {
    // The caller still sees the timeout. A cancel that itself fails must not hide it.
  }
}

/**
 * `subscribe({ withPolling: true })` only returns after the render finishes, so a
 * Promise.race timeout abandoned the paid job and kept polling. Polling ourselves
 * keeps `request_id` and posts `cancel_url` when our deadline passes.
 */
export async function pollHiggsfieldJob(
  started: HiggsfieldJob,
  options: {
    timeoutMs: number;
    intervalMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    fetchImpl?: typeof fetch;
    authorization: string;
  }
): Promise<HiggsfieldJob> {
  const requestId = started.request_id?.trim();
  if (!requestId) {
    throw new Error("Higgsfield response missing request_id.");
  }

  const now = options.now ?? Date.now;
  const wait = options.sleep ?? sleep;
  const fetchImpl = options.fetchImpl ?? fetch;
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
  const deadline = now() + options.timeoutMs;
  const statusUrl = isHiggsfieldHttpsUrl(started.status_url)
    ? started.status_url
    : `${HIGGSFIELD_ORIGIN}/requests/${encodeURIComponent(requestId)}/status`;

  while (now() < deadline) {
    const response = await fetchImpl(statusUrl, {
      headers: { Authorization: options.authorization },
    });
    if (!response.ok) {
      if (response.status >= 500) {
        await wait(intervalMs);
        continue;
      }
      throw new Error(`Higgsfield status failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as HiggsfieldJob;
    if (body.status === "completed") {
      return { ...started, ...body, request_id: body.request_id?.trim() || requestId };
    }
    if (body.status === "failed" || body.status === "nsfw") {
      throw new Error(`Higgsfield render ${body.status}.`);
    }
    await wait(intervalMs);
  }

  await cancelHiggsfieldJob(started.cancel_url, fetchImpl, options.authorization);
  throw timeoutError(options.timeoutMs);
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

  const credentials = process.env.HF_CREDENTIALS?.trim() ?? "";
  const hf = getHiggsfieldClient();
  const deadline = Date.now() + HIGGSFIELD_TIMEOUT_MS;
  const input: Record<string, unknown> = {
    model: HIGGSFIELD_MODEL,
    prompt: trimmedPrompt,
    input_images: [{ type: "image_url", image_url: trimmedImageUrl }],
  };
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
    input.duration = durationSeconds;
  }
  input.audio = includeAudio;

  // withPolling false returns request_id and cancel_url before the render is done.
  const started = (await hf.subscribe(HIGGSFIELD_ENDPOINT, {
    input,
    withPolling: false,
  })) as HiggsfieldJob;
  const authorization = `Key ${credentials}`;
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    await cancelHiggsfieldJob(started.cancel_url, fetch, authorization);
    throw timeoutError(HIGGSFIELD_TIMEOUT_MS);
  }
  const result = await pollHiggsfieldJob(started, {
    timeoutMs: remainingMs,
    authorization,
  });

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
