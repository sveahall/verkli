import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_RATE_LIMIT_EXCEEDED,
  E_TTS_PREVIEW_INVALID_INPUT,
  E_TTS_PREVIEW_INVALID_VOICE,
} from "@/lib/api-errors";
import { isTtsLabEnabled } from "@/lib/flags";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import {
  TTS_PREVIEW_VOICE_ALLOWLIST,
  TTS_PREVIEW_DEFAULT_VOICE,
} from "@/lib/tts/preview-voices";

const MAX_TEXT_LENGTH = 500;

const rateLimiter = createPerUserRateLimiter({ maxPerMinute: 3 });

type Body = {
  text?: string;
  voiceId?: string;
  speed?: number;
  seed?: number;
  format?: "wav" | "mp3";
};

function resolveVoiceId(raw: unknown): { ok: true; voiceId: string } | { ok: false; error: string } {
  const s = typeof raw === "string" ? raw.trim() || TTS_PREVIEW_DEFAULT_VOICE : TTS_PREVIEW_DEFAULT_VOICE;
  if (TTS_PREVIEW_VOICE_ALLOWLIST.includes(s as (typeof TTS_PREVIEW_VOICE_ALLOWLIST)[number])) {
    return { ok: true, voiceId: s };
  }
  return { ok: false, error: E_TTS_PREVIEW_INVALID_VOICE };
}

export async function POST(request: Request) {
  if (!isTtsLabEnabled()) {
    return apiError("TTS_LAB_DISABLED", 404);
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const rl = rateLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, { retryAfterSeconds: rl.retryAfterSeconds });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") {
    return apiError(E_TTS_PREVIEW_INVALID_INPUT, 400);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_TEXT_LENGTH) {
    return apiError(E_TTS_PREVIEW_INVALID_INPUT, 400, {
      detail: `text required, max ${MAX_TEXT_LENGTH} chars`,
    });
  }

  const voiceResult = resolveVoiceId(body.voiceId);
  if (!voiceResult.ok) {
    return apiError(voiceResult.error, 400);
  }

  const voiceId = voiceResult.voiceId;
  const format = body.format === "mp3" ? "mp3" : "wav";
  const speed = typeof body.speed === "number" && Number.isFinite(body.speed) ? body.speed : null;
  const seed = typeof body.seed === "number" && Number.isInteger(body.seed) ? body.seed : null;

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("tts_preview_jobs")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ jobId: existing.id }, { status: 202 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (profile?.role as string) === "reader" ? "reader" : "author";

  const { data: job, error } = await admin
    .from("tts_preview_jobs")
    .insert({
      user_id: user.id,
      role,
      text,
      voice_id: voiceId,
      speed,
      seed,
      format,
      status: "queued",
      progress: 0,
    })
    .select("id")
    .single();

  if (error) {
    if (process.env.TTS_LAB_DEBUG === "1") {
      console.error("[tts-preview] insert failed", { error: error.message });
    }
    return apiError("TTS_PREVIEW_JOB_CREATE_FAILED", 500);
  }

  return NextResponse.json({ jobId: job.id });
}
