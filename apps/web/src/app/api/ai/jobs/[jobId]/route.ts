import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { normalizeJobStatus } from "@/lib/job-status";
import { sanitizeJobError } from "@/lib/sanitize-job-error";
import { apiError, E_JOB_FETCH_FAILED } from "@/lib/api-errors";

const ALLOWED_JOB_KINDS = new Set([
  "text_to_video",
  "trailer_build",
  "marketing_video_generate",
  "marketing_generate",
]);

type JobRow = {
  id: string;
  status: string;
  progress: number | null;
  output: Record<string, unknown> | null;
  error: string | null;
  user_id: string;
  kind: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const { jobId } = await params;

  // RLS policy `ai_jobs_select_own` restricts SELECT to `auth.uid() = user_id`,
  // so the user-bound client cannot leak another user's job even if the
  // explicit `user_id` check below regresses.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_jobs" as never)
    .select("id, status, progress, output, error, user_id, kind, created_at, started_at, finished_at, updated_at")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) {
    return apiError(E_JOB_FETCH_FAILED, 404);
  }

  const job = data as JobRow;
  if (job.user_id !== user.id || !ALLOWED_JOB_KINDS.has(job.kind)) {
    return apiError(E_JOB_FETCH_FAILED, 404);
  }

  return NextResponse.json({
    jobId: job.id,
    kind: job.kind,
    status: normalizeJobStatus(job.status),
    progress: typeof job.progress === "number" ? job.progress : 0,
    output: job.output,
    error: sanitizeJobError(job.error),
    createdAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    updatedAt: job.updated_at,
  });
}
