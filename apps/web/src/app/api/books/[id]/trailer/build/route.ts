import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { evaluateDemoGuard } from "@/lib/demo-guard";
import { requireProBillingForApi } from "@/lib/billing/server";
import { isMarketingEnabled } from "@/lib/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import {
  TrailerGenerateRequestSchema,
  generateTrailerPrompt,
} from "@/lib/ai/trailer-generation";
import { generateImageToVideo } from "@/lib/higgsfield";
import { uploadTrailerAndGetPublicUrl } from "@/lib/marketing/trailer-storage";
import { stitchSceneVideos } from "@/lib/marketing/trailer-ffmpeg";
import { validateProviderImageUrl } from "@/lib/security/url-allowlist";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_MARKETING_FEATURE_DISABLED,
  E_RATE_LIMIT_EXCEEDED,
  E_TEXT_TO_VIDEO_FAILED,
  E_TRAILER_GENERATION_FAILED,
  E_UNAUTHORIZED,
  E_VALIDATION_FAILED,
  E_INVALID_BOOK_ID,
} from "@/lib/api-errors";

export const maxDuration = 300;
export const runtime = "nodejs";

const SCENE_DURATION_SECONDS = 5;
const MAX_SCENES = 3;
const rateLimiter = createPerUserRateLimiter({ maxPerMinute: 1 });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // Demo-mode short-circuit (see lib/demo-guard).
  const guard = await evaluateDemoGuard(createClient, user.id, "trailer/build");
  if (guard.shouldSkip && guard.response) return guard.response;

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
  if (!UUID_RE.test(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

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
  // SSRF guard — `cover_image` is a free-form user-writable column. Refuse
  // anything that isn't on the approved host-list before handing it to
  // Higgsfield (which may fetch/redirect server-side on our behalf).
  const coverUrlCheck = validateProviderImageUrl(ownedBook.cover_image);
  if (!coverUrlCheck.ok) {
    return apiError(E_VALIDATION_FAILED, 400, {
      detail: { cover_image: ["Book cover image must be a supported URL before trailer build."] },
    });
  }
  const safeCoverImageUrl = coverUrlCheck.url.toString();

  // Mark book as generating
  await admin
    .from("books")
    .update({ trailer_status: "generating" })
    .eq("id", bookId);

  let trailerResult: Awaited<ReturnType<typeof generateTrailerPrompt>>;
  try {
    trailerResult = await generateTrailerPrompt(parsed.data);
  } catch (err) {
    console.error(
      "[trailer build] trailer generation failed:",
      err instanceof Error ? err.message : String(err)
    );
    return apiError(E_TRAILER_GENERATION_FAILED, 500);
  }

  const includeAudio = parsed.data.audio ?? true;
  const scenes = trailerResult.output.scenes.slice(0, MAX_SCENES);
  if (scenes.length === 0) {
    return apiError(E_TRAILER_GENERATION_FAILED, 500, {
      detail: "No trailer scenes returned.",
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
        trailer_generation_metadata: trailerResult.metadata,
      },
      duration_seconds: scenes.length * SCENE_DURATION_SECONDS,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    console.error("[trailer build] insert media_asset failed:", insertError?.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  try {
    const sceneResults = await Promise.all(
      scenes.map((scene) =>
        generateImageToVideo({
          prompt: scene.visual_prompt,
          imageUrl: safeCoverImageUrl,
          durationSeconds: SCENE_DURATION_SECONDS,
          includeAudio,
        })
      )
    );

    const finalVideoBuffer = await stitchSceneVideos(
      sceneResults.map((result) => result.videoUrl)
    );

    const uploadResult = await uploadTrailerAndGetPublicUrl(
      admin,
      user.id,
      inserted.id,
      finalVideoBuffer,
      "video/mp4"
    );

    if ("error" in uploadResult) {
      throw new Error(uploadResult.error);
    }

    const providerRequestId = sceneResults.map((result) => result.requestId).join(",");
    const { error: readyUpdateError } = await admin
      .from("media_assets")
      .update({
        status: "ready",
        provider: "higgsfield",
        provider_request_id: providerRequestId,
        output_url: uploadResult.publicUrl,
        metadata: trailerResult.output,
        duration_seconds: scenes.length * SCENE_DURATION_SECONDS,
        error: null,
      })
      .eq("id", inserted.id)
      .eq("user_id", user.id);

    if (readyUpdateError) {
      console.error("[trailer build] mark ready failed:", readyUpdateError.message);
      return apiError(E_DATABASE_ERROR, 500);
    }

    // Denormalize trailer URL onto books row for fast reader queries
    await admin
      .from("books")
      .update({ trailer_url: uploadResult.publicUrl, trailer_status: "ready" })
      .eq("id", bookId);

    return NextResponse.json({
      assetId: inserted.id,
      url: uploadResult.publicUrl,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown trailer build error.";

    await markMediaAssetFailed(admin, inserted.id, user.id, message);

    // Mark book trailer as failed
    await admin
      .from("books")
      .update({ trailer_status: "failed" })
      .eq("id", bookId);

    console.error("[trailer build] failed:", message);
    return apiError(E_TEXT_TO_VIDEO_FAILED, 502, { detail: message });
  }
}
