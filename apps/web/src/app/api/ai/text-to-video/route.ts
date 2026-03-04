import { generateImageToVideo } from "@/lib/higgsfield";
import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import {
  apiError,
  E_UNAUTHORIZED,
  E_PROMPT_TEXT_REQUIRED,
  E_TEXT_TO_VIDEO_FAILED,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";

/** Higgsfield image→video can take 1–2+ minutes. */
export const maxDuration = 300;

// ─── Rate limiting (per-user token bucket) ──────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_MINUTE = 5; // Video generation is expensive — tight limit

type RateLimitEntry = { tokens: number; lastRefill: number };
const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const existing = rateLimitMap.get(userId);
  if (!existing) {
    rateLimitMap.set(userId, { tokens: RATE_LIMIT_MAX_PER_MINUTE - 1, lastRefill: now });
    return { allowed: true };
  }
  const elapsed = now - existing.lastRefill;
  if (elapsed >= RATE_LIMIT_WINDOW_MS) {
    existing.tokens = RATE_LIMIT_MAX_PER_MINUTE - 1;
    existing.lastRefill = now;
    return { allowed: true };
  }
  if (existing.tokens <= 0) {
    return { allowed: false, retryAfterSeconds: Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 1000) };
  }
  existing.tokens -= 1;
  return { allowed: true };
}

// ─── Request parsing ────────────────────────────────────────────────────────
const DURATIONS = [4, 6, 8] as const;

type TextToVideoBody = {
  promptText?: string;
  imageUrl?: string;
  duration?: 4 | 6 | 8;
  audio?: boolean;
};

function parseBody(body: unknown): TextToVideoBody | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const opts: TextToVideoBody = {};
  if (typeof o.promptText === "string" && o.promptText.trim()) opts.promptText = o.promptText.trim();
  if (typeof o.imageUrl === "string" && o.imageUrl.trim()) opts.imageUrl = o.imageUrl.trim();
  if (typeof o.duration === "number" && DURATIONS.includes(o.duration as (typeof DURATIONS)[number])) opts.duration = o.duration as 4 | 6 | 8;
  if (typeof o.audio === "boolean") opts.audio = o.audio;
  return opts;
}

export async function POST(req: Request) {
  // SECURITY: Require author role - this endpoint uses paid video credits
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;
  if (!user) return apiError(E_UNAUTHORIZED, 401);

  // SECURITY: Rate limit per user — video credits are expensive
  const rl = checkRateLimit(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) return proGate.response;

  try {
    let options: TextToVideoBody = {};
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      options = parseBody(body) ?? {};
    }
    if (!options.promptText) {
      return apiError(E_PROMPT_TEXT_REQUIRED, 400);
    }
    if (!options.imageUrl) {
      return apiError("VALIDATION_FAILED", 400, {
        detail: "imageUrl required",
      });
    }
    const result = await generateImageToVideo({
      prompt: options.promptText,
      imageUrl: options.imageUrl,
      durationSeconds: options.duration,
      includeAudio: options.audio ?? true,
    });
    return NextResponse.json({
      requestId: result.requestId,
      videoUrl: result.videoUrl,
    });
  } catch (err) {
    console.error("[text-to-video] generation failed", err instanceof Error ? err.message : String(err));
    return apiError(E_TEXT_TO_VIDEO_FAILED, 500);
  }
}
