import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminRoleForApi } from "@/lib/admin-auth";
import { apiError, E_INVALID_REQUEST_BODY, E_DATABASE_ERROR } from "@/lib/api-errors";
import {
  isActionableQueue,
  retryFailedJobs,
  RETRY_BATCH_MAX,
} from "@/lib/queues/admin-queue-actions";

/**
 * Queue write actions for admin. The dashboard at /admin/queues has been
 * read-only, so a stuck job could not be retried from anywhere — on launch day
 * that leaves a redeploy or a raw Redis session as the only recourse.
 */
export async function POST(request: Request) {
  const { user: adminUser, response } = await requireAdminRoleForApi();
  if (response || !adminUser) return response ?? apiError("UNAUTHORIZED", 401);

  const body = await request.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  const queueName = body?.queueName;

  if (action !== "retry-failed" || !isActionableQueue(queueName)) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const requested = Number(body?.limit);
  const limit = Number.isFinite(requested) ? requested : RETRY_BATCH_MAX;

  const result = await retryFailedJobs(queueName, limit);

  if (!result.ok) {
    console.error("[admin/queues] retry failed", {
      queueName,
      adminUserId: adminUser.id,
      message: result.error,
    });
    return apiError(E_DATABASE_ERROR, 502);
  }

  // Audit trail — best-effort. The jobs are already moving; failing the request
  // because the log write failed would invite a second retry on top of the first.
  try {
    await createAdminClient()
      .from("audit_log")
      .insert({
        entity_type: "queue",
        entity_id: null,
        action: "retry_failed_jobs",
        actor_user_id: adminUser.id,
        actor_role: "admin",
        meta: {
          queue: queueName,
          retried: result.retried,
          failed_to_retry: result.failedToRetry,
          remaining: result.remaining,
        },
      });
  } catch (auditError) {
    console.error("[admin/queues] audit log insert failed", {
      queueName,
      adminUserId: adminUser.id,
      message:
        auditError instanceof Error ? auditError.message : String(auditError),
    });
  }

  return NextResponse.json(result);
}
