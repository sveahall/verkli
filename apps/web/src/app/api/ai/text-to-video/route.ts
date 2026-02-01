import { makeVideo, type TextToVideoOptions } from "@/lib/ai/textToVideo";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { wrapApiRoute, jsonError, ERROR_CODES, isApiError } from "@/lib/api/errors";
import { textToVideoBodySchema, firstZodMessage } from "@/lib/api/schemas";
import { checkRateLimit, rateLimitKey } from "@/lib/api/rate-limit";
import { isStripeEnabled } from "@/lib/stripe/server";
import { requirePro, getEntitlements } from "@/lib/billing/entitlements";
import {
  enforceQuota,
  incrementUsage,
  getLimitForKey,
  USAGE_KEYS,
} from "@/lib/usage/quota";
import {
  createJob,
  startJob,
  finishJob,
  failJob,
  AI_JOB_KINDS,
} from "@/lib/ai/jobs";
import { auditLog } from "@/lib/api/audit";
import { createAdminClient } from "@/lib/supabase/admin";

/** Runway text→video often takes 1–2+ minutes. */
export const maxDuration = 300;

async function postHandler(request: Request, ctx: { requestId: string }): Promise<Response> {
  const key = rateLimitKey(request, "/api/ai/text-to-video");
  if (!checkRateLimit(key, { windowMs: 60 * 1000, max: 3 }).allowed) {
    return jsonError(ERROR_CODES.RATE_LIMIT, "Too many requests. Try again later.", ctx.requestId, 429);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return jsonError(ERROR_CODES.NOT_AUTHENTICATED, "Not authenticated", ctx.requestId, 401);
  }
  if (isStripeEnabled()) {
    try {
      await requirePro(user.id);
    } catch (e) {
      if (isApiError(e)) return jsonError(e.code, e.message, ctx.requestId, e.status);
      throw e;
    }
  }

  const ent = await getEntitlements(user.id);
  const limit = getLimitForKey(USAGE_KEYS.AI_TEXT_TO_VIDEO, ent.is_pro);
  await enforceQuota(user.id, USAGE_KEYS.AI_TEXT_TO_VIDEO, limit);

  const contentType = request.headers.get("content-type") ?? "";
  let raw: unknown = {};
  if (contentType.includes("application/json")) {
    raw = await request.json().catch(() => ({}));
  }
  const parsed = textToVideoBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(ERROR_CODES.VALIDATION_ERROR, firstZodMessage(parsed), ctx.requestId, 400);
  }
  const options = parsed.data as TextToVideoOptions;
  const jobId = await createJob(user.id, AI_JOB_KINDS.TEXT_TO_VIDEO, {
    promptLength: options.promptText?.length ?? 0,
    duration: options.duration ?? null,
  });
  await auditLog({
    actorUserId: user.id,
    actorRole: "author",
    action: "ai_job_created",
    entityType: "ai_job",
    entityId: jobId,
    requestId: ctx.requestId,
    meta: { kind: AI_JOB_KINDS.TEXT_TO_VIDEO },
  }).catch(() => {});

  await startJob(jobId);
  await auditLog({
    actorUserId: user.id,
    actorRole: "author",
    action: "ai_job_started",
    entityType: "ai_job",
    entityId: jobId,
    requestId: ctx.requestId,
  }).catch(() => {});

  try {
    const result = await makeVideo(options);
    await finishJob(jobId, { status: "done" });
    await auditLog({
      actorUserId: user.id,
      actorRole: "author",
      action: "ai_job_done",
      entityType: "ai_job",
      entityId: jobId,
      requestId: ctx.requestId,
    }).catch(() => {});
    const admin = createAdminClient();
    await admin.from("analytics_events").insert({
      user_id: user.id,
      event_name: "ai_job_done",
      props: { job_id: jobId, kind: AI_JOB_KINDS.TEXT_TO_VIDEO },
    }).catch(() => {});
    await incrementUsage(user.id, USAGE_KEYS.AI_TEXT_TO_VIDEO, 1);
    return NextResponse.json(result, { headers: { "x-request-id": ctx.requestId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await failJob(jobId, message).catch(() => {});
    await auditLog({
      actorUserId: user.id,
      actorRole: "author",
      action: "ai_job_failed",
      entityType: "ai_job",
      entityId: jobId,
      requestId: ctx.requestId,
      meta: { kind: AI_JOB_KINDS.TEXT_TO_VIDEO },
    }).catch(() => {});
    const admin = createAdminClient();
    await admin.from("analytics_events").insert({
      user_id: user.id,
      event_name: "ai_job_failed",
      props: { job_id: jobId, kind: AI_JOB_KINDS.TEXT_TO_VIDEO },
    }).catch(() => {});
    throw err;
  }
}

export const POST = wrapApiRoute(postHandler);
