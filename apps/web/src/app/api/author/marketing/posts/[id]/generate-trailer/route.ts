import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { generateTrailerPrompt } from "@/lib/ai/trailer-generation";
import { generateImageToVideo } from "@/lib/higgsfield";
import { uploadTrailerAndGetPublicUrl } from "@/lib/marketing/trailer-storage";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_TEXT_TO_VIDEO_FAILED,
  E_TRAILER_GENERATION_FAILED,
  isValidUuid,
} from "@/lib/api-errors";

export const runtime = "nodejs";
export const maxDuration = 240;
const TRAILER_DOWNLOAD_TIMEOUT_MS = 25_000;
const ESTIMATED_COST_USD = 0.15;

type PostRow = {
  id: string;
  book_id: string;
  author_id: string;
  language: string;
  channel: string;
  content_type: string;
  caption: string | null;
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
    .select("id, book_id, author_id, language, channel, content_type, caption")
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

  // Mark as generating
  await supabase
    .from("marketing_posts")
    .update({ status: "asset_pending", asset_error: null })
    .eq("id", post.id);

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

  const { data: assetInsert, error: insertErr } = await supabase
    .from("media_assets")
    .insert({
      user_id: gate.user.id,
      book_id: book.id,
      type: "video",
      status: "generating",
      provider: "higgsfield",
      input_json: { model: "dop-standard", prompt, imageUrl: book.cover_image, audio: true },
      duration_seconds: 5,
    })
    .select("id")
    .single();

  if (insertErr || !assetInsert?.id) {
    console.error("[trailer post] media_assets insert:", insertErr?.message);
    await supabase
      .from("marketing_posts")
      .update({ status: "asset_failed", asset_error: "asset_insert_failed" })
      .eq("id", post.id);
    return apiError(E_DATABASE_ERROR, 500);
  }

  const assetId = assetInsert.id as string;

  try {
    const { requestId, videoUrl } = await generateImageToVideo({
      prompt,
      imageUrl: book.cover_image,
      includeAudio: true,
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
