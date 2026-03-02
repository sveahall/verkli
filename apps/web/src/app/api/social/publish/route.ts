import { NextResponse } from "next/server";
import { isSocialEnabled } from "@/lib/flags";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_SOCIAL_FEATURE_DISABLED,
  E_SOCIAL_INVALID_PLATFORM,
  E_SOCIAL_CAMPAIGN_NOT_FOUND,
  E_JOB_CREATION_FAILED,
  E_QUEUE_UNAVAILABLE,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";
import { VALID_PLATFORMS } from "@/lib/social/platform-constraints";
import { checkPublishRateLimit } from "@/lib/social/rate-limit";
import { enqueueSocialPublishJob } from "@/lib/social-publish-queue";

export async function POST(request: Request) {
  if (!isSocialEnabled()) {
    return apiError(E_SOCIAL_FEATURE_DISABLED, 403);
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) return proGate.response;

  const rl = await checkPublishRateLimit(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return apiError("INVALID_REQUEST_BODY", 400);
  }

  const { campaignId, platforms } = body as { campaignId?: string; platforms?: string[] };

  if (!campaignId || !platforms || !Array.isArray(platforms) || platforms.length === 0) {
    return apiError("INVALID_REQUEST_BODY", 400);
  }

  // Validate platforms
  for (const p of platforms) {
    if (!VALID_PLATFORMS.includes(p)) {
      return apiError(E_SOCIAL_INVALID_PLATFORM, 400, { detail: p });
    }
  }

  const admin = createAdminClient();

  // Fetch campaign and verify ownership
  const { data: campaign, error: campaignError } = await admin
    .from("marketing_campaigns" as never)
    .select("id, book_id, user_id, status")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError || !campaign) {
    return apiError(E_SOCIAL_CAMPAIGN_NOT_FOUND, 404);
  }

  const camp = campaign as { id: string; book_id: string; user_id: string; status: string };
  if (camp.user_id !== user.id) {
    return apiError(E_SOCIAL_CAMPAIGN_NOT_FOUND, 404);
  }

  // Check for existing active publish job for this campaign
  const { data: existingJob } = await admin
    .from("ai_jobs" as never)
    .select("id, status")
    .eq("kind", "social_publish")
    .eq("user_id", user.id)
    .eq("book_id", camp.book_id)
    .in("status", ["pending", "processing"])
    .maybeSingle();

  if (existingJob) {
    const ej = existingJob as { id: string; status: string };
    return NextResponse.json(
      { ok: true, jobId: ej.id, status: ej.status, message: "Job already in progress" },
      { status: 202 }
    );
  }

  // Create ai_jobs record
  const { data: job, error: jobError } = await admin
    .from("ai_jobs" as never)
    .insert({
      user_id: user.id,
      kind: "social_publish",
      book_id: camp.book_id,
      status: "pending",
      progress: 0,
      input: {
        campaignId,
        bookId: camp.book_id,
        platforms,
      },
      output: {
        results: {},
      },
    })
    .select("id")
    .single();

  if (jobError || !job) {
    console.error("[social publish] failed to create job:", jobError?.message);
    return apiError(E_JOB_CREATION_FAILED, 500);
  }

  const jobRow = job as { id: string };

  // Enqueue BullMQ job
  let queuedId: string | null = null;
  try {
    queuedId = await enqueueSocialPublishJob({
      jobId: jobRow.id,
      campaignId,
      bookId: camp.book_id,
      userId: user.id,
      platforms,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[social publish] queue enqueue failed:", msg, "jobId:", jobRow.id);
  }

  if (!queuedId) {
    await admin
      .from("ai_jobs" as never)
      .update({ status: "failed", error: "Queue unavailable", progress: 0 })
      .eq("id", jobRow.id);
    return apiError(E_QUEUE_UNAVAILABLE, 503);
  }

  return NextResponse.json(
    { ok: true, jobId: jobRow.id, status: "pending", platforms },
    { status: 202 }
  );
}
