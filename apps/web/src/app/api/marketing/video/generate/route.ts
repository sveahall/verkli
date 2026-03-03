import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { assertBookOwned } from "@/lib/marketing/assert-book-owner";
import { videoGenerateBodySchema } from "@/lib/marketing/schemas";
import { enqueueMarketingVideoGenerateJob } from "@/lib/marketing-queue";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_JSON,
  E_JOB_CREATION_FAILED,
  E_QUEUE_UNAVAILABLE,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = videoGenerateBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { bookId, prompt, imageUrl, metadata: requestMetadata } = parsed.data;
  const supabase = await createClient();

  const ownership = await assertBookOwned(supabase, gate.user.id, bookId);
  if (!ownership.ok) return ownership.response;

  const inputJson = {
    model: "dop-standard",
    prompt,
    imageUrl,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("media_assets")
    .insert({
      user_id: gate.user.id,
      book_id: bookId,
      type: "video",
      status: "generating",
      provider: "higgsfield",
      input_json: inputJson,
      duration_seconds: 5,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    console.error("[marketing video generate] insert media_asset failed:", insertError?.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  const admin = createAdminClient();
  const { data: job, error: jobError } = await admin
    .from("ai_jobs" as never)
    .insert({
      user_id: gate.user.id,
      kind: "marketing_video_generate",
      book_id: bookId,
      status: "pending",
      progress: 0,
      input: {
        assetId: inserted.id,
        prompt,
        imageUrl,
        metadata: requestMetadata ?? null,
      },
      output: {
        stage: "queued",
      },
    } as never)
    .select("id")
    .single();

  if (jobError || !job?.id) {
    console.error("[marketing video generate] failed to create job", {
      userId: gate.user.id,
      bookId,
      assetId: inserted.id,
      message: jobError?.message ?? "unknown",
      code: jobError?.code,
    });
    await supabase
      .from("media_assets")
      .update({ status: "failed", error: "Job creation failed" })
      .eq("id", inserted.id)
      .eq("user_id", gate.user.id);
    return apiError(E_JOB_CREATION_FAILED, 500);
  }

  const queued = await enqueueMarketingVideoGenerateJob({
    jobId: job.id,
    assetId: inserted.id,
    bookId,
    userId: gate.user.id,
    prompt,
    imageUrl,
    metadata: (requestMetadata as Record<string, unknown> | null | undefined) ?? null,
  });

  if (!queued) {
    await admin
      .from("ai_jobs" as never)
      .update({ status: "failed", error: "Queue unavailable" } as never)
      .eq("id", job.id)
      .eq("user_id", gate.user.id);
    await supabase
      .from("media_assets")
      .update({ status: "failed", error: "Queue unavailable" })
      .eq("id", inserted.id)
      .eq("user_id", gate.user.id);
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
