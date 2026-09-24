import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isPostDeliveryLocked } from "@/lib/marketing/post-delivery-state";
import type { TablesUpdate } from "@/lib/supabase/types";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { requireProBillingForApi } from "@/lib/billing/server";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { generateTrailerPrompt } from "@/lib/ai/trailer-generation";
import { HIGGSFIELD_MODEL, HiggsfieldPendingError, assertHiggsfieldConfigured, generateImageToVideo } from "@/lib/higgsfield";
import { reserveVideoBudget, refundVideoBudget } from "@/lib/marketing/video-budget";
import { uploadTrailerAndGetPublicUrl } from "@/lib/marketing/trailer-storage";
import { validateProviderImageUrl } from "@/lib/security/url-allowlist";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_RATE_LIMIT_EXCEEDED,
  E_TEXT_TO_VIDEO_FAILED,
  E_TRAILER_GENERATION_FAILED,
  isValidUuid,
} from "@/lib/api-errors";
import { aiDisabledResponse } from "@/features/ai-team/settings/guard";

export const runtime = "nodejs";
export const maxDuration = 240;

// Same provider and the same per-generation cost as marketing/video/generate;
// this one runs up to 240s. One a minute.
const trailerLimiter = createPerUserRateLimiter({ name: "marketing-post-trailer", maxPerMinute: 1 });
const TRAILER_DOWNLOAD_TIMEOUT_MS = 25_000;

type PostRow = {
  id: string;
  book_id: string;
  author_id: string;
  language: string;
  channel: string;
  content_type: string;
  caption: string | null;
  hashtags: string | null;
  status: string;
  updated_at: string;
  metadata: unknown;
  media_asset_id: string | null;
};

type BookRow = {
  id: string;
  title: string | null;
  description: string | null;
  cover_image: string | null;
};

function providerSignature(userId: string, bookId: string, assetId: string, providerId: string) {
  return createHmac("sha256", process.env.HF_CREDENTIALS ?? "").update(JSON.stringify([userId, bookId, assetId, providerId])).digest("hex");
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  // Account master AI switch. Server-side, so turning AI off is a real
  // setting and not just a hidden button.
  const aiOff = await aiDisabledResponse(gate.user.id);
  if (aiOff) return aiOff;

  const rl = await trailerLimiter.check(gate.user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const proGate = await requireProBillingForApi(gate.user.id);
  if (!proGate.ok) return proGate.response;

  const { id } = await params;
  if (!isValidUuid(id)) return apiError(E_INVALID_BOOK_ID, 400);

  const input = z.object({ expectedUpdatedAt: z.string().datetime({ offset: true }) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return apiError("INVALID_REQUEST", 400, { detail: "Save and reload your draft before generating a trailer." });
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: post, error: postErr } = await supabase
    .from("marketing_posts")
    .select("id, book_id, author_id, language, channel, content_type, caption, hashtags, status, updated_at, metadata, media_asset_id")
    .eq("id", id)
    .eq("author_id", gate.user.id)
    .maybeSingle<PostRow>();

  if (postErr) {
    console.error("[trailer post] post lookup:", postErr.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!post) return apiError(E_INVALID_BOOK_ID, 404);
  if (post.updated_at !== input.data.expectedUpdatedAt || post.status === "posted" || isPostDeliveryLocked(post.metadata)) {
    return apiError("POST_CHANGED", 409, { detail: "This post changed or is already generating. Reload before trying again." });
  }
  if (post.content_type !== "trailer") {
    return apiError(E_TRAILER_GENERATION_FAILED, 400);
  }

  let existingAsset: { id: string; provider_request_id: string | null; input_json: unknown; status: string; metadata: unknown } | null = null;
  const postMetadata = post.metadata && typeof post.metadata === "object" && !Array.isArray(post.metadata) ? post.metadata as Record<string, unknown> : {};
  if (post.status === "asset_pending") {
    const lease = postMetadata.trailerPollLeaseUntil;
    if (typeof lease === "string" && Date.parse(lease) > Date.now()) {
      return apiError("POST_CHANGED", 409, { detail: "The trailer is already being checked. Wait for that request to finish, then refresh." });
    }
    if (post.media_asset_id) {
      const lookup = await supabase.from("media_assets").select("id, provider_request_id, input_json, status, metadata")
        .eq("id", post.media_asset_id).eq("user_id", gate.user.id).eq("book_id", post.book_id).maybeSingle();
      if (lookup.error) { console.error("[marketing trailer] resume lookup:", lookup.error.message); return apiError(E_DATABASE_ERROR, 500); }
      existingAsset = lookup.data;
    }
    if (!existingAsset?.provider_request_id || existingAsset.status !== "generating") {
      return apiError("POST_CHANGED", 409, { detail: "The trailer request is still being saved. Refresh before checking it again." });
    }
    const signature = (existingAsset.metadata as { providerSignature?: unknown } | null)?.providerSignature;
    const expected = providerSignature(gate.user.id, post.book_id, existingAsset.id, existingAsset.provider_request_id);
    if (typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature) || !process.env.HF_CREDENTIALS || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      console.error("[marketing trailer] invalid saved provider provenance:", { assetId: existingAsset.id });
      return apiError("TRAILER_RECOVERY_REQUIRED", 409, { detail: "This saved render could not be verified. Contact support before generating again." });
    }
  }

  const { data: book, error: bookErr } = await supabase
    .from("books")
    .select("id, title, description, cover_image")
    .eq("id", post.book_id)
    .maybeSingle<BookRow>();

  if (bookErr || !book) {
    console.error("[trailer post] book lookup:", bookErr?.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (!book.cover_image) return apiError(E_TRAILER_GENERATION_FAILED, 422, { detail: "Add a cover image to this book before generating a trailer." });

  // SSRF guard — `cover_image` is a free-form user-writable column. Refuse
  // anything that isn't on the approved host-list before handing it to
  // Higgsfield (which may fetch/redirect server-side on our behalf). Mirrors
  // the guard in books/[id]/trailer/build and marketing/video/generate.
  // Keep the normalised url: the provider must fetch exactly what passed the
  // allowlist, not the raw column value.
  const coverUrlCheck = validateProviderImageUrl(book.cover_image);
  if (!coverUrlCheck.ok) return apiError(E_TRAILER_GENERATION_FAILED, 422, { detail: "Upload a cover image to Verkli before generating a trailer." });
  const safeCoverImageUrl = coverUrlCheck.url.toString();

  try { assertHiggsfieldConfigured(); }
  catch (error) {
    console.error("[marketing trailer] configuration:", error instanceof Error ? error.message : "Missing video credentials");
    return apiError("TRAILER_UNAVAILABLE", 503, { detail: "Video generation is temporarily unavailable. Your draft is saved; try again later." });
  }

  const { data: claimed, error: claimError } = await supabase.from("marketing_posts")
    .update({ status: "asset_pending", asset_error: null, metadata: { ...postMetadata, trailerPollLeaseUntil: new Date(Date.now() + maxDuration * 1_000).toISOString() } as TablesUpdate<"marketing_posts">["metadata"] }).eq("id", id).eq("author_id", gate.user.id)
    .eq("status", post.status).eq("updated_at", post.updated_at).select("id, updated_at").maybeSingle();
  if (claimError) { console.error("[marketing trailer] claim:", claimError.message); return apiError(E_DATABASE_ERROR, 500); }
  if (!claimed) return apiError("POST_CHANGED", 409, { detail: "Another request changed this post. Reload before generating." });
  let claimRevision = claimed.updated_at;
  const updateClaimedPost = async (patch: TablesUpdate<"marketing_posts">) => {
    const nextPatch = patch.status === "draft" || patch.status === "asset_failed" ? { ...patch, metadata: { ...postMetadata, trailerPollLeaseUntil: null } as TablesUpdate<"marketing_posts">["metadata"] } : patch;
    const result = await supabase.from("marketing_posts").update(nextPatch).eq("id", id).eq("author_id", gate.user.id)
      .eq("status", "asset_pending").eq("updated_at", claimRevision).select("id, updated_at").maybeSingle();
    if (result.error) console.error("[marketing trailer] save:", result.error.message);
    if (result.data) claimRevision = result.data.updated_at;
    return result;
  };

  let scenes: { visual_prompt: string; duration: number }[] = [];
  let trailerCaption = post.caption ?? "";
  let hashtagsArr: string[] = [];
  let assetId = existingAsset?.id ?? "";
  const savedInput = existingAsset?.input_json as { prompt?: string } | null;
  let prompt = savedInput?.prompt ?? "Saved trailer";
  if (!existingAsset) {
    type AllowedGenre =
      | "romance"
      | "fantasy"
      | "thriller"
      | "ya"
      | "literary"
      | "biography";
    // Books can have multiple genres via book_genres join. For trailer generation
    // we default to "literary" which is the safest visual style; authors can
    // regenerate to refine. A future PR can fetch the primary genre via the
    // book_genres join.
    const genre: AllowedGenre = "literary";

    type AllowedTone =
      | "dark"
      | "dreamy"
      | "intense"
      | "whimsical"
      | "melancholic"
      | "suspenseful"
      | "passionate"
      | "epic";
    const toneByGenre: Record<AllowedGenre, AllowedTone> = {
      romance: "passionate",
      fantasy: "epic",
      thriller: "suspenseful",
      ya: "dreamy",
      literary: "melancholic",
      biography: "intense",
    };


    try {
      const trailer = await generateTrailerPrompt({
        title: book.title ?? "Untitled",
        genre,
        description: (book.description ?? book.title ?? "A new book").slice(0, 1900),
        keywords: [book.title ?? "book", genre],
        tone: toneByGenre[genre],
        audio: true,
      });
      scenes = trailer.output.scenes;
      if (!trailerCaption) trailerCaption = trailer.output.caption;
      hashtagsArr = trailer.output.hashtags;
    } catch (err) {
      console.error("[trailer post] prompt:", err instanceof Error ? err.message : err);
      await updateClaimedPost({ status: "asset_failed", asset_error: "Could not prepare the trailer. Please try again." });
      return apiError(E_TRAILER_GENERATION_FAILED, 500);
    }

    const sceneText = scenes.map((s) => s.visual_prompt).join(" — ");
    prompt = sceneText.slice(0, 1900);

    // The scenes concatenate into a single Higgsfield call, so this costs one
    // unit regardless of scene count. Only pre-dispatch failures are refundable.
    let budget;
    try { budget = await reserveVideoBudget({ userId: gate.user.id, units: 1 }); }
    catch {
      await updateClaimedPost({ status: "asset_failed", asset_error: "Trailer generation is temporarily unavailable. Try again later." });
      return apiError("TRAILER_UNAVAILABLE", 503);
    }
    if (!budget.ok) {
      await updateClaimedPost({ status: "asset_failed", asset_error: "Trailer generation could not start. Try again later." });
      return budget.response;
    }

    const { data: assetInsert, error: insertErr } = await supabase
      .from("media_assets")
      .insert({
        user_id: gate.user.id,
        book_id: book.id,
        type: "video",
        status: "generating",
        provider: "higgsfield",
        input_json: { model: HIGGSFIELD_MODEL, prompt, imageUrl: safeCoverImageUrl, audio: true },
        duration_seconds: 5,
      })
      .select("id")
      .single();

    if (insertErr || !assetInsert?.id) {
      console.error("[trailer post] media_assets insert:", insertErr?.message);
      await refundVideoBudget(budget.reservation);
      await updateClaimedPost({ status: "asset_failed", asset_error: "Could not save the trailer request. Please try again." });
      return apiError(E_DATABASE_ERROR, 500);
    }

    assetId = assetInsert.id as string;
    const attachment = await updateClaimedPost({ media_asset_id: assetId });
    if (attachment.error || !attachment.data) {
      await refundVideoBudget(budget.reservation);
      await updateClaimedPost({ status: "asset_failed", asset_error: "Could not save the trailer request. Please try again." });
      return apiError(E_DATABASE_ERROR, 500);
    }

  }

  try {
    const { requestId, videoUrl } = await generateImageToVideo({
      prompt,
      requestId: existingAsset?.provider_request_id ?? undefined,
      onSubmitted: async (providerId) => {
        const savedId = await supabase.from("media_assets").update({ provider_request_id: providerId, metadata: { scenes, caption: trailerCaption, hashtags: hashtagsArr, providerSignature: providerSignature(gate.user.id, post.book_id, assetId, providerId) } })
          .eq("id", assetId).eq("user_id", gate.user.id).select("id").maybeSingle();
        if (savedId.error || !savedId.data) {
          console.error("[marketing trailer] provider ID save failed:", { assetId, providerId });
          throw Object.assign(new Error("Provider request was accepted but could not be saved. Contact support before trying again."), { recoveryRequired: true });
        }
      },
      imageUrl: safeCoverImageUrl,
      includeAudio: true,
      meter: { userId: gate.user.id, pipeline: "marketing", bookId: book.id },
    });

    const res = await fetchWithTimeout(videoUrl, TRAILER_DOWNLOAD_TIMEOUT_MS);
    if (!res.ok) {
      throw new Error(`download failed: ${res.status}`);
    }
    const buffer = await res.arrayBuffer();

    const upload = await uploadTrailerAndGetPublicUrl(
      admin,
      gate.user.id,
      assetId,
      buffer,
      res.headers.get("content-type") || "video/mp4"
    );
    if ("error" in upload) {
      throw new Error(upload.error);
    }

    const { data: saved, error: postSaveError } = await updateClaimedPost({
      status: "draft", media_asset_id: assetId, media_asset_url: upload.publicUrl, asset_error: null,
    });
    if (postSaveError || !saved) return apiError("POST_CHANGED", 409, { detail: "Could not attach this trailer because the post changed. Refresh before checking again." });

    const { error: mediaSaveError } = await supabase
      .from("media_assets")
      .update({
        status: "ready",
        provider_request_id: requestId,
        output_url: upload.publicUrl,
        estimated_cost_usd: null,
        metadata: {
          scenes,
          caption: trailerCaption,
          hashtags: hashtagsArr,
        },
        error: null,
      })
      .eq("id", assetId)
      .eq("user_id", gate.user.id);

    if (mediaSaveError) {
      console.error("[marketing trailer] media finalization:", mediaSaveError.message);
      return apiError(E_DATABASE_ERROR, 500);
    }

    return NextResponse.json({
      ok: true,
      post: {
        id: post.id,
        mediaAssetId: assetId,
        mediaAssetUrl: upload.publicUrl,
        caption: post.caption,
        hashtags: post.hashtags,
        updatedAt: saved.updated_at,
      },
    });
  } catch (err) {
    if (err instanceof HiggsfieldPendingError) {
      console.info("[marketing trailer] still processing:", { assetId, requestId: err.requestId });
      const released = await updateClaimedPost({ metadata: { ...postMetadata, trailerPollLeaseUntil: null } as TablesUpdate<"marketing_posts">["metadata"] });
      if (released.error || !released.data) return apiError("POST_CHANGED", 409);
      return NextResponse.json({ pending: true, detail: "Your trailer is still processing. Check again shortly; this continues the same render." }, { status: 202 });
    }
    if (err && typeof err === "object" && "recoveryRequired" in err) {
      await updateClaimedPost({ asset_error: "Your render was accepted but could not be linked. Contact support before generating again." });
      return apiError("TRAILER_RECOVERY_REQUIRED", 503, { detail: "Your render was accepted but could not be linked. Contact support before generating again." });
    }
    // Keep the reservation after dispatch: provider or storage failure can still be billable.
    const message = err instanceof Error ? err.message : "trailer generation failed";
    console.error("[trailer post] generation:", message);

    const failed = await updateClaimedPost({ status: "asset_failed", asset_error: "Trailer generation is temporarily unavailable. Your saved text is unchanged. Try again later." });
    if (!failed.data || failed.error) return apiError("POST_CHANGED", 409);
    await supabase.from("media_assets").update({ status: "failed", error: message })
      .eq("id", assetId).eq("user_id", gate.user.id);

    return apiError(E_TEXT_TO_VIDEO_FAILED, 502, { detail: "Trailer generation is temporarily unavailable. Your saved text is unchanged. Try again later." });
  }
}
