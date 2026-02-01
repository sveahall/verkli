import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { isMarketingEnabled } from "@/lib/flags";
import { getLanguageLabel, normalizeLanguage } from "@/lib/languages";
import { wrapApiRoute, jsonError, ERROR_CODES, type ApiRouteContext, isApiError } from "@/lib/api/errors";
import { bookIdParamSchema, marketingGenerateBodySchema, firstZodMessage } from "@/lib/api/schemas";
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

async function postHandler(
  request: Request,
  ctx: { requestId: string },
  routeContext: ApiRouteContext
): Promise<Response> {
  const key = rateLimitKey(request, "/api/books/[id]/marketing/generate");
  if (!checkRateLimit(key, { windowMs: 60 * 1000, max: 10 }).allowed) {
    return jsonError(ERROR_CODES.RATE_LIMIT, "Too many requests. Try again later.", ctx.requestId, 429);
  }
  assertPublicEnv();
  if (!isMarketingEnabled()) {
    return jsonError(ERROR_CODES.FORBIDDEN, "Marketing feature is disabled", ctx.requestId, 403);
  }
  const rawParams = await (routeContext.params ?? Promise.resolve({}));
  const paramResult = bookIdParamSchema.safeParse(rawParams);
  if (!paramResult.success) {
    return jsonError(ERROR_CODES.VALIDATION_ERROR, firstZodMessage(paramResult), ctx.requestId, 400);
  }
  const { id: bookId } = paramResult.data;

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
  const limit = getLimitForKey(USAGE_KEYS.MARKETING_GENERATE, ent.is_pro);
  try {
    await enforceQuota(user.id, USAGE_KEYS.MARKETING_GENERATE, limit);
  } catch (e) {
    if (isApiError(e)) throw e;
    throw e;
  }

  const rawBody = await request.json().catch(() => ({}));
  const bodyResult = marketingGenerateBodySchema.safeParse(rawBody ?? {});
  if (!bodyResult.success) {
    return jsonError(ERROR_CODES.VALIDATION_ERROR, firstZodMessage(bodyResult), ctx.requestId, 400);
  }
  const { language: langInput, channel } = bodyResult.data;
  const language = normalizeLanguage(langInput);

  const { data: book, error: bookFetchError } = await supabase
    .from("books")
    .select("id, title, author_id, language, original_url")
    .eq("id", bookId)
    .maybeSingle();

  if (bookFetchError) {
    return jsonError(ERROR_CODES.INTERNAL_ERROR, "Failed to load book", ctx.requestId, 500);
  }
  if (!book || book.author_id !== user.id) {
    return jsonError(ERROR_CODES.NOT_FOUND, "Book not found or access denied", ctx.requestId, 404);
  }

  const langLabel = getLanguageLabel(language);
  const readerPath = `/reader/books/${bookId}`;
  const shareUrl = readerPath;

  const headline = `${book.title} – now in ${langLabel}`;
  const caption = `Just published: ${book.title} in ${langLabel} on Verkli. Read it here: ${readerPath}`;
  const cta = "Read on Verkli";
  const hashtags =
    channel === "x" || channel === "instagram" || channel === "tiktok"
      ? "#Verkli #translation #read"
      : "";

  const campaign = {
    book_id: bookId,
    language,
    channel,
    status: "generated",
    headline,
    caption,
    cta,
    hashtags: hashtags || null,
    share_url: shareUrl,
  };

  const jobId = await createJob(user.id, AI_JOB_KINDS.MARKETING_GENERATE, {
    book_id: bookId,
    language,
    channel,
  });
  await auditLog({
    actorUserId: user.id,
    actorRole: "author",
    action: "ai_job_created",
    entityType: "ai_job",
    entityId: jobId,
    requestId: ctx.requestId,
    meta: { kind: AI_JOB_KINDS.MARKETING_GENERATE },
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
    const { data: upserted, error: upsertError } = await supabase
      .from("marketing_launch_copy")
      .upsert(campaign, { onConflict: "book_id,language,channel" })
      .select()
      .single();

    if (upsertError) {
      await failJob(jobId, "Failed to save campaign").catch(() => {});
      await auditLog({
        actorUserId: user.id,
        actorRole: "author",
        action: "ai_job_failed",
        entityType: "ai_job",
        entityId: jobId,
        requestId: ctx.requestId,
      }).catch(() => {});
      const admin = createAdminClient();
      await admin.from("analytics_events").insert({
        user_id: user.id,
        event_name: "ai_job_failed",
        props: { job_id: jobId, kind: AI_JOB_KINDS.MARKETING_GENERATE },
      }).catch(() => {});
      return jsonError(ERROR_CODES.INTERNAL_ERROR, "Failed to save campaign", ctx.requestId, 500);
    }

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
      props: { job_id: jobId, kind: AI_JOB_KINDS.MARKETING_GENERATE },
    }).catch(() => {});

    await incrementUsage(user.id, USAGE_KEYS.MARKETING_GENERATE, 1);

    return NextResponse.json(upserted, { headers: { "x-request-id": ctx.requestId } });
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
    }).catch(() => {});
    const admin = createAdminClient();
    await admin.from("analytics_events").insert({
      user_id: user.id,
      event_name: "ai_job_failed",
      props: { job_id: jobId, kind: AI_JOB_KINDS.MARKETING_GENERATE },
    }).catch(() => {});
    throw err;
  }
}

export const POST = wrapApiRoute(postHandler);
