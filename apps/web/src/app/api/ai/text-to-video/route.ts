import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueTextToVideoJob } from "@/lib/marketing-queue";
import {
  apiError,
  E_UNAUTHORIZED,
  E_PROMPT_TEXT_REQUIRED,
  E_JOB_CREATION_FAILED,
  E_QUEUE_UNAVAILABLE,
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

type ParsedTextToVideoOptions = {
  promptText?: string;
  duration?: 4 | 6 | 8;
  ratio?: "1280:720" | "720:1280" | "1080:1920" | "1920:1080";
  audio?: boolean;
};

function parseBody(body: unknown): ParsedTextToVideoOptions | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const opts: ParsedTextToVideoOptions = {};
  if (typeof o.promptText === "string" && o.promptText.trim()) opts.promptText = o.promptText.trim();
  if (typeof o.duration === "number" && DURATIONS.includes(o.duration as (typeof DURATIONS)[number])) opts.duration = o.duration as 4 | 6 | 8;
  if (typeof o.ratio === "string" && RATIOS.includes(o.ratio as (typeof RATIOS)[number])) opts.ratio = o.ratio as "1280:720" | "720:1280" | "1080:1920" | "1920:1080";
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

  let options: ParsedTextToVideoOptions = {};
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json();
    options = parseBody(body) ?? {};
  }
  if (!options.promptText) {
    return apiError(E_PROMPT_TEXT_REQUIRED, 400);
  }

  const admin = createAdminClient();
  const { data: job, error: jobError } = await admin
    .from("ai_jobs" as never)
    .insert({
      user_id: user.id,
      kind: "text_to_video",
      status: "pending",
      progress: 0,
      input: {
        options,
      },
      output: {
        stage: "queued",
      },
    } as never)
    .select("id")
    .single();

  if (jobError || !job?.id) {
    console.error("[text-to-video] failed to create job", {
      userId: user.id,
      message: jobError?.message ?? "unknown",
      code: jobError?.code,
    });
    return apiError(E_JOB_CREATION_FAILED, 500);
  }

  const queued = await enqueueTextToVideoJob({
    jobId: job.id,
    userId: user.id,
    options,
  });

  if (!queued) {
    await admin
      .from("ai_jobs" as never)
      .update({
        status: "failed",
        error: "Queue unavailable",
      } as never)
      .eq("id", job.id)
      .eq("user_id", user.id);
    return apiError(E_QUEUE_UNAVAILABLE, 503);
  }

  return NextResponse.json(
    {
      ok: true,
      jobId: job.id,
      status: "pending",
      statusUrl: `/api/ai/jobs/${job.id}`,
    },
    { status: 202 }
  );
}
