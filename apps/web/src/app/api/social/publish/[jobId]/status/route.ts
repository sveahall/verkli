import { NextResponse } from "next/server";
import { isSocialEnabled } from "@/lib/flags";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_SOCIAL_FEATURE_DISABLED,
  E_JOB_FETCH_FAILED,
} from "@/lib/api-errors";
import { normalizeJobStatus } from "@/lib/job-status";
import { sanitizeJobError } from "@/lib/sanitize-job-error";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  if (!isSocialEnabled()) {
    return apiError(E_SOCIAL_FEATURE_DISABLED, 403);
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) return proGate.response;

  const { jobId } = await params;
  const admin = createAdminClient();

  const { data: job, error } = await admin
    .from("ai_jobs" as never)
    .select("id, status, progress, output, error, user_id, kind")
    .eq("id", jobId)
    .eq("kind", "social_publish")
    .maybeSingle();

  if (error || !job) {
    return apiError(E_JOB_FETCH_FAILED, 404);
  }

  const jobRow = job as {
    id: string;
    status: string;
    progress: number;
    output: Record<string, unknown> | null;
    error: string | null;
    user_id: string;
    kind: string;
  };

  // Verify ownership
  if (jobRow.user_id !== user.id) {
    return apiError(E_JOB_FETCH_FAILED, 404);
  }

  return NextResponse.json({
    jobId: jobRow.id,
    status: normalizeJobStatus(jobRow.status),
    progress: jobRow.progress,
    results: (jobRow.output as Record<string, unknown>)?.results ?? null,
    error: sanitizeJobError(jobRow.error),
  });
}
