import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { generateTrailerPrompt } from "@/lib/ai/trailer-generation";
import { generateImageToVideo } from "@/lib/higgsfield";
import { uploadTrailerAndGetPublicUrl } from "@/lib/marketing/trailer-storage";
import { validateProviderImageUrl } from "@/lib/security/url-allowlist";
import { reserveVideoBudget, refundVideoBudget } from "@/lib/marketing/video-budget";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { requireProBillingForApi } from "@/lib/billing/server";
import { evaluateDemoGuard } from "@/lib/demo-guard";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_RATE_LIMIT_EXCEEDED,
  E_TEXT_TO_VIDEO_FAILED,
  E_TRAILER_GENERATION_FAILED,
  isValidUuid,
} from "@/lib/api-errors";

export const runtime = "nodejs";
export const maxDuration = 240;
const TRAILER_DOWNLOAD_TIMEOUT_MS = 25_000;
const ESTIMATED_COST_USD = 0.15;

// Spend gate. This route takes no body and used to re-mint a Higgsfield job on
// every call, so an author could loop it for ESTIMATED_COST_USD a time. Matches
// books/[id]/trailer/build, which spends the same credit behind 1/min + Pro.
const rateLimiter = createPerUserRateLimiter({
  name: "marketing-post-generate-trailer",
  maxPerMinute: 1,
});

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
  media_asset_id: string | null;
  media_asset_url: string | null;
};

type BookRow = {
  id: string;
  title: string | null;
  description: string | null;
  cover_image: string | null;
};

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
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  const { id } = await params;
  if (!isValidUuid(id)) return apiError(E_INVALID_BOOK_ID, 400);

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: post, error: postErr } = await supabase
    .from("marketing_posts")
    .select(
      "id, book_id, author_id, language, channel, content_type, caption, hashtags, status, media_asset_id, media_asset_url"
    )
    .eq("id", id)
    .eq("author_id", gate.user.id)
    .maybeSingle<PostRow>();

  if (postErr) {
    console.error("[trailer post] post lookup:", postErr.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!post) return apiError(E_INVALID_BOOK_ID, 404);
  if (post.content_type !== "trailer") {
    return apiError(E_TRAILER_GENERATION_FAILED, 400);
  }

  // Already generated: hand back the existing asset. This runs BEFORE the spend
  // gates on purpose — reading back a trailer costs nothing, so an author whose
  // Pro subscription lapsed should still see what they already paid for, and a
  // re-read should not burn the 1/min token that protects the paid path.
  // Response shape matches the success path at the bottom of this file:
  // `hashtags` is a string there, so it is a string here.
  if (post.status === "ready" && post.media_asset_url) {
    return NextResponse.json({
      ok: true,
      reused: true,
      post: {
        id: post.id,
        mediaAssetId: post.media_asset_id,
        mediaAssetUrl: post.media_asset_url,
        caption: post.caption,
        hashtags: post.hashtags ?? "",
      },
    });
  }

  // A job is already running for this post. Without this, a second call while
  // the first is in flight mints another media_assets row and another paid
  // Higgsfield job, and whichever finishes last overwrites the others'
  // media_asset_url — orphaning work that was already paid for. maxDuration is
  // 240s, so the window is wide.
  if (post.status === "asset_pending") {
    return apiError(E_TRAILER_GENERATION_FAILED, 409, {
      reason: "generation_already_in_progress",
    });
  }

  // Demo guard before the spend gates, matching books/[id]/trailer/build. The
  // `{ok:true, demo_mode:true}` body is contractual (see lib/demo-guard), so a
  // demo account must reach it rather than being turned away by a billing 403 —
  // and it must not spend a rate-limit token on the way.
  const demo = await evaluateDemoGuard(
    () => Promise.resolve(supabase),
    gate.user.id,
    "author/marketing/posts/generate-trailer"
  );
  if (demo.shouldSkip && demo.response) return demo.response;

  const rl = await rateLimiter.check(gate.user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const proGate = await requireProBillingForApi(gate.user.id);
  if (!proGate.ok) return proGate.response;

  const { data: book, error: bookErr } = await supabase
    .from("books")
    .select("id, title, description, cover_image")
    .eq("id", post.book_id)
    .maybeSingle<BookRow>();

  if (bookErr || !book) {
    console.error("[trailer post] book lookup:", bookErr?.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (!book.cover_image) {
    await supabase
      .from("marketing_posts")
      .update({
        status: "asset_failed",
        asset_error: "missing_cover_image",
      })
      .eq("id", post.id);
    return apiError(E_TRAILER_GENERATION_FAILED, 422);
  }

  // SSRF guard — `cover_image` is a free-form user-writable column. Refuse
  // anything that isn't on the approved host-list before handing it to
  // Higgsfield (which may fetch/redirect server-side on our behalf). Mirrors
  // the guard in books/[id]/trailer/build and marketing/video/generate.
  const coverUrlCheck = validateProviderImageUrl(book.cover_image);
  if (!coverUrlCheck.ok) {
    await supabase
      .from("marketing_posts")
      .update({
        status: "asset_failed",
        asset_error: "invalid_cover_image_url",
      })
      .eq("id", post.id);
    return apiError(E_TRAILER_GENERATION_FAILED, 422);
  }
  // Forward the PARSED url, never the raw column text. The guard reads the
  // host with WHATWG `new URL()`, which folds `\` to `/` and strips tabs and
  // newlines; a provider parsing the raw string under RFC 3986 userinfo rules
  // would resolve a different host from the same bytes. `.toString()` emits
  // the normalized form the guard actually approved, closing that gap.
  const safeCoverImageUrl = coverUrlCheck.url.toString();

  // Claim the post atomically. `.eq("status", post.status)` makes this a
  // compare-and-set against the value we read above: if another request got
  // here first the row no longer matches and we get zero rows back, so only one
  // caller ever proceeds to spend. The status check earlier in this function
  // narrows the window; this closes it.
  const { data: claimed, error: claimErr } = await supabase
    .from("marketing_posts")
    .update({ status: "asset_pending", asset_error: null })
    .eq("id", post.id)
    .eq("status", post.status)
    .select("id");

  if (claimErr) {
    console.error("[trailer post] claim failed:", claimErr.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!claimed || claimed.length === 0) {
    return apiError(E_TRAILER_GENERATION_FAILED, 409, {
      reason: "generation_already_in_progress",
    });
  }

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

  let scenes: { visual_prompt: string; duration: number }[] = [];
  let trailerCaption = post.caption ?? "";
  let hashtagsArr: string[] = [];

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
    await supabase
      .from("marketing_posts")
      .update({ status: "asset_failed", asset_error: "prompt_generation_failed" })
      .eq("id", post.id);
    return apiError(E_TRAILER_GENERATION_FAILED, 500);
  }

  const sceneText = scenes.map((s) => s.visual_prompt).join(" — ");
  const prompt = sceneText.slice(0, 1900);

  // The scenes are concatenated into a single Higgsfield call, so this costs
  // one unit regardless of scene count. Refunded below if it produces nothing.
  const budget = await reserveVideoBudget({ userId: gate.user.id, units: 1 });
  if (!budget.ok) {
    // The compare-and-set above already moved this row to `asset_pending`, and
    // the guard at the top of this handler answers 409 for that status forever
    // — nothing in this repo ever writes it back to another value, and the UI
    // pins the button disabled on it. Releasing the claim here is what stops a
    // single over-quota click from permanently bricking the post, including
    // after the daily window resets. Scoped with `.eq("status", ...)` so a
    // concurrent writer that already moved the row on is not clobbered.
    await supabase
      .from("marketing_posts")
      .update({ status: post.status, asset_error: null })
      .eq("id", post.id)
      .eq("status", "asset_pending");
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
      input_json: { model: "dop-standard", prompt, imageUrl: safeCoverImageUrl, audio: true },
      duration_seconds: 5,
    })
    .select("id")
    .single();

  if (insertErr || !assetInsert?.id) {
    console.error("[trailer post] media_assets insert:", insertErr?.message);
    // No Higgsfield call has happened, so the reservation is owed back. The
    // comment above the reservation ("Refunded below if it produces nothing")
    // was not true on this path: the only refund sits in the provider catch
    // block, which this early return never reaches.
    await refundVideoBudget(budget.reservation);
    await supabase
      .from("marketing_posts")
      .update({ status: "asset_failed", asset_error: "asset_insert_failed" })
      .eq("id", post.id);
    return apiError(E_DATABASE_ERROR, 500);
  }

  const assetId = assetInsert.id as string;

  // Set the moment the provider returns. The catch below wraps the upload and
  // several writes as well as the generation call, so without this a failure
  // after a successful render refunds a unit that was genuinely spent.
  let providerBilled = false;

  try {
    const { requestId, videoUrl } = await generateImageToVideo({
      prompt,
      imageUrl: safeCoverImageUrl,
      includeAudio: true,
    });
    providerBilled = true;

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

    await supabase
      .from("media_assets")
      .update({
        status: "ready",
        provider_request_id: requestId,
        output_url: upload.publicUrl,
        estimated_cost_usd: ESTIMATED_COST_USD,
        metadata: {
          scenes,
          caption: trailerCaption,
          hashtags: hashtagsArr,
        },
        error: null,
      })
      .eq("id", assetId)
      .eq("user_id", gate.user.id);

    await supabase
      .from("marketing_posts")
      .update({
        status: "ready",
        media_asset_id: assetId,
        media_asset_url: upload.publicUrl,
        caption: trailerCaption || post.caption,
        hashtags: hashtagsArr.join(" ") || null,
        asset_error: null,
      })
      .eq("id", post.id);

    return NextResponse.json({
      ok: true,
      post: {
        id: post.id,
        mediaAssetId: assetId,
        mediaAssetUrl: upload.publicUrl,
        caption: trailerCaption,
        hashtags: hashtagsArr.join(" "),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "trailer generation failed";
    console.error("[trailer post] generation:", message);

    // Refund only when the render never happened. A download, upload or write
    // failure after Higgsfield returned is a unit that was genuinely spent, and
    // returning it makes the daily ceiling unenforceable.
    if (!providerBilled) {
      await refundVideoBudget(budget.reservation);
    }

    await supabase
      .from("media_assets")
      .update({ status: "failed", error: message })
      .eq("id", assetId)
      .eq("user_id", gate.user.id);

    await supabase
      .from("marketing_posts")
      .update({ status: "asset_failed", asset_error: message })
      .eq("id", post.id);

    return apiError(E_TEXT_TO_VIDEO_FAILED, 502);
  }
}
