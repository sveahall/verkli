import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAudiobookStorageBucket } from "@/lib/tts/storage";
import { canUserReadBook } from "@/lib/books/access";
import { assertPublicEnv } from "@/lib/env";
import { isAudiobookEnabled } from "@/lib/flags";
import {
  apiError,
  E_AUDIOBOOK_FEATURE_DISABLED,
  E_AUDIO_PATH_INVALID,
  E_AUDIO_SIGN_FAILED,
  E_BOOK_NOT_FOUND,
  E_CHAPTER_NOT_PUBLISHED,
  E_DATABASE_ERROR,
  E_FORBIDDEN,
  E_INVALID_BOOK_ID,
  E_VALIDATION_FAILED,
  isValidUuid,
} from "@/lib/api-errors";

const SIGNED_URL_TTL_SECONDS = 60 * 15;

type BookRow = {
  id: string;
  status: string | null;
  author_id: string | null;
  price_amount: number | null;
  pricing_model: string | null;
};

type ChapterRow = {
  id: string;
  book_id: string;
  order: number;
  book_version_id: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  if (!isAudiobookEnabled()) {
    return apiError(E_AUDIOBOOK_FEATURE_DISABLED, 503);
  }

  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  const chapterId = new URL(request.url).searchParams.get("chapterId")?.trim() ?? "";
  if (!chapterId) {
    return apiError(E_VALIDATION_FAILED, 400, {
      details: { chapterId: "required" },
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Use admin client for lookups so RLS cannot silently hide rows.
  const admin = createAdminClient();

  const { data: chapter, error: chapterError } = await admin
    .from("chapters")
    .select("id, book_id, order, book_version_id")
    .eq("id", chapterId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (chapterError) {
    console.error("[audiobook play] chapter fetch failed", { chapterId, bookId, message: chapterError.message });
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!chapter) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const { data: book, error: bookError } = await admin
    .from("books")
    .select("id, status, author_id, price_amount, pricing_model")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[audiobook play] book fetch failed", { bookId, message: bookError.message });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const bookRow = book as BookRow | null;
  const chapterRow = chapter as ChapterRow;

  if (!bookRow) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const isAuthor = Boolean(user?.id && bookRow.author_id === user.id);
  const isPublished = String(bookRow.status ?? "").toUpperCase() === "PUBLISHED";

  // Authors may preview audio for unpublished books; readers require PUBLISHED.
  if (!isPublished && !isAuthor) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  // Authors always have access; for others, delegate to the shared access helper.
  let hasReadAccess = isAuthor;
  if (!hasReadAccess) {
    hasReadAccess = await canUserReadBook({
      supabase,
      userId: user?.id ?? null,
      bookId: bookRow.id,
      bookAuthorId: bookRow.author_id,
      bookPriceAmount: bookRow.price_amount,
      bookPricingModel: bookRow.pricing_model,
    });
  }

  if (!hasReadAccess) {
    return apiError(E_FORBIDDEN, 403);
  }

  // For non-author readers, verify the chapter is actually published
  // (published_chapter_count IS NULL → all chapters live, otherwise order < count).
  if (!isAuthor) {
    const { data: version, error: versionError } = await admin
      .from("book_versions")
      .select("published_at, published_chapter_count")
      .eq("id", chapterRow.book_version_id)
      .maybeSingle();

    if (versionError) {
      console.error("[audiobook play] version lookup failed", { bookId, versionId: chapterRow.book_version_id, message: versionError.message });
      return apiError(E_DATABASE_ERROR, 500);
    }

    if (!version || !version.published_at) {
      return apiError(E_CHAPTER_NOT_PUBLISHED, 403);
    }

    const publishedCount = version.published_chapter_count;
    if (typeof publishedCount === "number" && Number.isFinite(publishedCount)) {
      const chapterOrder = Number(chapterRow.order ?? 0);
      if (chapterOrder >= publishedCount) {
        return apiError(E_CHAPTER_NOT_PUBLISHED, 403);
      }
    }
  }

  const { data: cache, error: cacheError } = await admin
    .from("chapter_audio_cache")
    .select("audio_path, created_at")
    .eq("chapter_id", chapterRow.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cacheError) {
    console.error("[audiobook play] cache lookup failed", { chapterId: chapterRow.id, message: cacheError.message });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const audioPath = typeof cache?.audio_path === "string" ? cache.audio_path.trim() : "";

  if (!audioPath) {
    return NextResponse.json({ audioUrl: null });
  }

  // Reject http URLs stored in DB — only storage object paths are valid.
  if (/^https?:\/\//i.test(audioPath)) {
    console.warn("[audiobook play] rejected http URL in audio_path", { chapterId: chapterRow.id, audioPath: audioPath.slice(0, 80) });
    return apiError(E_AUDIO_PATH_INVALID, 500);
  }

  const bucket = getAudiobookStorageBucket();
  const { data: signed, error: signedError } = await admin.storage
    .from(bucket)
    .createSignedUrl(audioPath, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    console.error("[audiobook play] signed URL failed", {
      bucket,
      audioPath,
      chapterId: chapterRow.id,
      error: signedError?.message ?? "missing signedUrl",
    });
    return apiError(E_AUDIO_SIGN_FAILED, 500);
  }

  return NextResponse.json({
    audioUrl: signed.signedUrl,
  });
}
