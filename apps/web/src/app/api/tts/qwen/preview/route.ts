import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_INVALID_MULTIPART_BODY,
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
const MAX_REF_TEXT_LENGTH = 500;
const MAX_REF_AUDIO_BYTES = 15 * 1024 * 1024;
const TTS_PREVIEW_BUCKET = "tts_previews";

const rateLimiter = createPerUserRateLimiter({ maxPerMinute: 3 });

type Body = {
  text?: string;
  voiceId?: string;
  voiceProfile?: string;
  voicePrompt?: string;
  voiceRefText?: string;
  speed?: number;
  seed?: number;
  format?: "wav" | "mp3";
};

type VoiceJobPayload = {
  speaker: string;
  profile?: string;
  instruct?: string;
  refText?: string;
  refAudioPath?: string;
};

const LEGACY_SPEAKER_ALIASES: Record<string, string> = {
  ryan: "ryan",
  samantha: "serena",
  alex: "aiden",
  alloy: "eric",
  echo: "dylan",
  fable: "vivian",
  onyx: "uncle_fu",
  nova: "ono_anna",
  shimmer: "sohee",
};

function sanitizeOptionalText(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.length > maxLen) return null;
  return value;
}

function readFormString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function parseBodyFromFormData(formData: FormData): Body {
  const formatRaw = readFormString(formData, "format")?.toLowerCase();
  const speedRaw = readFormString(formData, "speed");
  const seedRaw = readFormString(formData, "seed");
  const speed = speedRaw !== undefined ? Number(speedRaw) : undefined;
  const seed = seedRaw !== undefined ? Number(seedRaw) : undefined;

  return {
    text: readFormString(formData, "text"),
    voiceId: readFormString(formData, "voiceId"),
    voiceProfile: readFormString(formData, "voiceProfile"),
    voicePrompt: readFormString(formData, "voicePrompt"),
    voiceRefText: readFormString(formData, "voiceRefText"),
    speed: Number.isFinite(speed) ? speed : undefined,
    seed: Number.isInteger(seed) ? seed : undefined,
    format: formatRaw === "mp3" ? "mp3" : "wav",
  };
}

function sanitizeStorageSegment(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function encodeVoiceIdForJob(payload: VoiceJobPayload): string {
  if (!payload.profile && !payload.instruct && !payload.refText && !payload.refAudioPath) {
    return payload.speaker;
  }
  return `json:${JSON.stringify(payload)}`;
}

function resolveVoiceId(raw: unknown): { ok: true; voiceId: string } | { ok: false; error: string } {
  const s = typeof raw === "string" ? raw.trim() || TTS_PREVIEW_DEFAULT_VOICE : TTS_PREVIEW_DEFAULT_VOICE;
  const normalized = s.toLowerCase();
  const canonical = TTS_PREVIEW_VOICE_ALLOWLIST.find((voice) => voice.toLowerCase() === normalized);
  if (canonical) {
    return { ok: true, voiceId: canonical };
  }
  const aliased = LEGACY_SPEAKER_ALIASES[normalized];
  if (aliased) {
    return { ok: true, voiceId: aliased };
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

  let body: Body | null = null;
  let refAudioFile: File | null = null;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return apiError(E_INVALID_MULTIPART_BODY, 400);
    }
    body = parseBodyFromFormData(formData);
    const refAudioEntry = formData.get("voiceRefAudio");
    if (refAudioEntry instanceof File && refAudioEntry.size > 0) {
      refAudioFile = refAudioEntry;
    } else if (refAudioEntry !== null) {
      return apiError(E_TTS_PREVIEW_INVALID_INPUT, 400, {
        detail: "voiceRefAudio must be a file",
      });
    }
  } else {
    body = (await request.json().catch(() => null)) as Body | null;
  }

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
  const voiceProfile = sanitizeOptionalText(body.voiceProfile, 64);
  const voicePrompt = sanitizeOptionalText(body.voicePrompt, 240);
  const voiceRefText = sanitizeOptionalText(body.voiceRefText, MAX_REF_TEXT_LENGTH);
  if (typeof body.voiceProfile === "string" && !voiceProfile) {
    return apiError(E_TTS_PREVIEW_INVALID_INPUT, 400, {
      detail: "voiceProfile must be 1-64 chars",
    });
  }
  if (typeof body.voicePrompt === "string" && !voicePrompt) {
    return apiError(E_TTS_PREVIEW_INVALID_INPUT, 400, {
      detail: "voicePrompt must be 1-240 chars",
    });
  }
  if (typeof body.voiceRefText === "string" && !voiceRefText) {
    return apiError(E_TTS_PREVIEW_INVALID_INPUT, 400, {
      detail: `voiceRefText must be 1-${MAX_REF_TEXT_LENGTH} chars`,
    });
  }
  if (refAudioFile) {
    if (!refAudioFile.type.toLowerCase().startsWith("audio/")) {
      return apiError(E_TTS_PREVIEW_INVALID_INPUT, 400, {
        detail: "voiceRefAudio must be an audio file",
      });
    }
    if (refAudioFile.size > MAX_REF_AUDIO_BYTES) {
      return apiError(E_TTS_PREVIEW_INVALID_INPUT, 400, {
        detail: `voiceRefAudio max size is ${MAX_REF_AUDIO_BYTES} bytes`,
      });
    }
  }
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

  let refAudioPath: string | null = null;
  if (refAudioFile) {
    const safeProfile = voiceProfile ? sanitizeStorageSegment(voiceProfile) : "";
    const extension = refAudioFile.name.includes(".")
      ? refAudioFile.name.slice(refAudioFile.name.lastIndexOf(".")).toLowerCase()
      : "";
    const storagePath = safeProfile
      ? `refs/${user.id}/profile-${safeProfile}${extension}`
      : `refs/${user.id}/upload-${crypto.randomUUID()}${extension}`;
    const buffer = Buffer.from(await refAudioFile.arrayBuffer());
    const { error: uploadError } = await admin.storage.from(TTS_PREVIEW_BUCKET).upload(storagePath, buffer, {
      contentType: refAudioFile.type || "application/octet-stream",
      upsert: true,
    });
    if (uploadError) {
      console.error("[tts preview] ref audio upload failed", {
        userId: user.id,
        voiceProfile,
        storagePath,
        error: uploadError.message,
      });
      return apiError("TTS_PREVIEW_REF_AUDIO_UPLOAD_FAILED", 500);
    }
    refAudioPath = storagePath;
  }

  const voiceIdForJob = encodeVoiceIdForJob({
    speaker: voiceId,
    profile: voiceProfile ?? undefined,
    instruct: voicePrompt ?? undefined,
    refText: voiceRefText ?? undefined,
    refAudioPath: refAudioPath ?? undefined,
  });

  const { data: job, error } = await admin
    .from("tts_preview_jobs")
    .insert({
      user_id: user.id,
      role,
      text,
      voice_id: voiceIdForJob,
      speed,
      seed,
      format,
      status: "queued",
      progress: 0,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[tts preview] insert failed", {
      userId: user.id,
      voiceId,
      voiceProfile,
      hasRefAudio: Boolean(refAudioPath),
      hasRefText: Boolean(voiceRefText),
      hasVoicePrompt: Boolean(voicePrompt),
      error: error.message,
    });
    return apiError("TTS_PREVIEW_JOB_CREATE_FAILED", 500);
  }

  return NextResponse.json({ jobId: job.id });
}
