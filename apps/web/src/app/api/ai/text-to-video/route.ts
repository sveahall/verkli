import { makeVideo, type TextToVideoOptions } from "@/lib/ai/textToVideo";
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

/** Runway text→video often takes 1–2+ minutes. */
export const maxDuration = 300;

// ─── Rate limiting (per-user token bucket) ──────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_MINUTE = 5; // Runway is expensive — tight limit

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
const RATIOS = ["1280:720", "720:1280", "1080:1920", "1920:1080"] as const;
const DURATIONS = [4, 6, 8] as const;

function parseBody(body: unknown): Partial<TextToVideoOptions> | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const opts: Partial<TextToVideoOptions> = {};
  if (typeof o.promptText === "string" && o.promptText.trim()) opts.promptText = o.promptText.trim();
  if (typeof o.duration === "number" && DURATIONS.includes(o.duration as (typeof DURATIONS)[number])) opts.duration = o.duration as 4 | 6 | 8;
  if (typeof o.ratio === "string" && RATIOS.includes(o.ratio as (typeof RATIOS)[number])) opts.ratio = o.ratio as TextToVideoOptions["ratio"];
  if (typeof o.audio === "boolean") opts.audio = o.audio;
  return opts;
}

export async function POST(req: Request) {
  // SECURITY: Require author role - this endpoint uses paid Runway credits
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;
  if (!user) return apiError(E_UNAUTHORIZED, 401);

  // SECURITY: Rate limit per user — Runway credits are expensive
  const rl = checkRateLimit(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) return proGate.response;

  try {
    let options: Partial<TextToVideoOptions> = {};
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      options = parseBody(body) ?? {};
    }
    if (!options.promptText) {
      return apiError(E_PROMPT_TEXT_REQUIRED, 400);
    }
    const result = await makeVideo(options as TextToVideoOptions);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[text-to-video] generation failed", err instanceof Error ? err.message : String(err));
    return apiError(E_TEXT_TO_VIDEO_FAILED, 500);
  }
}
