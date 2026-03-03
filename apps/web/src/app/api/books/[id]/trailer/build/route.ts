import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import { isMarketingEnabled } from "@/lib/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import {
  TrailerGenerateRequestSchema,
} from "@/lib/ai/trailer-generation";
import { enqueueTrailerBuildJob } from "@/lib/marketing-queue";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_JOB_CREATION_FAILED,
  E_MARKETING_FEATURE_DISABLED,
  E_QUEUE_UNAVAILABLE,
  E_RATE_LIMIT_EXCEEDED,
  E_UNAUTHORIZED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const maxDuration = 600;

const SCENE_DURATION_SECONDS = 5;
const rateLimiter = createPerUserRateLimiter({ maxPerMinute: 1 });

type BookRow = {
  id: string;
  author_id: string | null;
  cover_image: string | null;
};

async function markMediaAssetFailed(
  admin: ReturnType<typeof createAdminClient>,
  assetId: string,
  userId: string,
  message: string
) {
  const { error } = await admin
    .from("media_assets")
    .update({
      status: "failed",
      error: message,
    })
    .eq("id", assetId)
    .eq("user_id", userId);

  if (error) {
    console.error("[trailer build] mark failed update error:", error.message);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;
  if (!user) return apiError(E_UNAUTHORIZED, 401);

  if (!isMarketingEnabled()) {
    return apiError(E_MARKETING_FEATURE_DISABLED, 403);
  }

  const rl = await rateLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) return proGate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const parsed = TrailerGenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400, {
      detail: parsed.error.flatten().fieldErrors,
    });
  }

  const { id: bookId } = await params;
  const admin = createAdminClient();

  const { data: book, error: bookError } = await admin
    .from("books")
    .select("id, author_id, cover_image")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[trailer build] book fetch failed:", bookError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  const ownedBook = book as BookRow | null;
  if (!ownedBook || ownedBook.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }
  if (!ownedBook.cover_image) {
    return apiError(E_VALIDATION_FAILED, 400, {
      detail: { cover_image: ["Book cover image is required to build trailer."] },
    });
  }

  const { data: inserted, error: insertError } = await admin
    .from("media_assets")
    .insert({
      user_id: user.id,
      book_id: bookId,
      type: "video",
      status: "generating",
      provider: "higgsfield",
      input_json: {
        trailer_request: parsed.data,
      },
      duration_seconds: SCENE_DURATION_SECONDS * 3,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    console.error("[trailer build] insert media_asset failed:", insertError?.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  const { data: job, error: jobError } = await admin
    .from("ai_jobs" as never)
    .insert({
      user_id: user.id,
      kind: "trailer_build",
      book_id: bookId,
      status: "pending",
      progress: 0,
      input: {
        assetId: inserted.id,
        trailerRequest: parsed.data,
        coverImageUrl: ownedBook.cover_image,
      },
      output: {
        stage: "queued",
      },
    } as never)
    .select("id")
    .single();

  if (jobError || !job?.id) {
    const message = jobError?.message ?? "Failed to create trailer build job.";
    console.error("[trailer build] failed to create job:", message);
    await markMediaAssetFailed(admin, inserted.id, user.id, message);
    return apiError(E_JOB_CREATION_FAILED, 500);
  }

  const queued = await enqueueTrailerBuildJob({
    jobId: job.id,
    assetId: inserted.id,
    bookId,
    userId: user.id,
    coverImageUrl: ownedBook.cover_image,
    trailerRequest: parsed.data as Record<string, unknown>,
  });

  if (!queued) {
    await admin
      .from("ai_jobs" as never)
      .update({ status: "failed", error: "Queue unavailable" } as never)
      .eq("id", job.id)
      .eq("user_id", user.id);
    await markMediaAssetFailed(admin, inserted.id, user.id, "Queue unavailable");
    return apiError(E_QUEUE_UNAVAILABLE, 503);
  }

  return NextResponse.json(
    {
      ok: true,
      jobId: job.id,
      assetId: inserted.id,
      status: "pending",
      statusUrl: `/api/ai/jobs/${job.id}`,
    },
    { status: 202 }
  );
}
