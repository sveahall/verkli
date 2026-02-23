import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, E_TTS_PREVIEW_JOB_NOT_FOUND } from "@/lib/api-errors";
import { isTtsLabEnabled } from "@/lib/flags";
import { sanitizeJobError } from "@/lib/sanitize-job-error";

const TTS_PREVIEW_BUCKET = "tts_previews";
const SIGNED_URL_TTL_SECONDS = 60 * 15;

export async function GET(request: Request) {
  if (!isTtsLabEnabled()) {
    return apiError("TTS_LAB_DISABLED", 404);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("NOT_AUTHENTICATED", 401);
  }

  const jobId = new URL(request.url).searchParams.get("jobId")?.trim();
  if (!jobId) {
    return apiError("VALIDATION_FAILED", 400, { detail: "jobId required" });
  }

  const admin = createAdminClient();

  const { data: job, error } = await admin
    .from("tts_preview_jobs")
    .select("id, user_id, status, progress, audio_path, error")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    if (process.env.TTS_LAB_DEBUG === "1") {
      console.error("[tts-preview status] fetch failed", { jobId, error: error.message });
    }
    return apiError("DATABASE_ERROR", 500);
  }

  if (!job) {
    return apiError(E_TTS_PREVIEW_JOB_NOT_FOUND, 404);
  }

  const jobRow = job as {
    id: string;
    user_id: string;
    status: string;
    progress: number;
    audio_path: string | null;
    error: string | null;
  };

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = String(profile?.role ?? "").toLowerCase() === "admin";
  if (jobRow.user_id !== user.id && !isAdmin) {
    return apiError(E_TTS_PREVIEW_JOB_NOT_FOUND, 404);
  }

  const status = normalizeStatus(jobRow.status);
  let audioUrl: string | null = null;
  let signErrorKey: string | null = null;

  if (status === "succeeded" && jobRow.audio_path) {
    const path = jobRow.audio_path.trim();
    if (!/^https?:\/\//i.test(path)) {
      const { data: signed, error: signError } = await admin.storage
        .from(TTS_PREVIEW_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

      if (!signError && signed?.signedUrl) {
        audioUrl = signed.signedUrl;
      } else {
        if (process.env.TTS_LAB_DEBUG === "1" || process.env.NODE_ENV !== "test") {
          console.error("[tts-preview status] signed URL failed", { jobId, error: signError?.message });
        }
        signErrorKey = "AUDIO_SIGN_FAILED";
      }
    }
  }

  return NextResponse.json({
    status,
    progress: jobRow.progress,
    audioUrl,
    error: signErrorKey ?? sanitizeJobError(jobRow.error),
  });
}

function normalizeStatus(db: string): "queued" | "running" | "succeeded" | "failed" {
  const s = String(db ?? "").toLowerCase();
  if (s === "queued" || s === "running" || s === "succeeded" || s === "failed") return s;
  return "queued";
}
