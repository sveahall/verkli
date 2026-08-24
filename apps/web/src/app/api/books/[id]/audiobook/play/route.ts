import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminRole } from "@/lib/admin-auth";
import { resolveNarratorVoiceId } from "@/lib/tts/tts-provider";
import { getAudiobookStorageBucket } from "@/lib/tts/storage";
import { canUserReadBook, type SupabaseLikeClient } from "@/lib/books/access";
import { logAnalyticsEvent } from "@/lib/analytics/events";
import { shouldResumeAt } from "@/lib/analytics/listen";
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

  // Admins may listen to any chapter's audio for moderation. This only widens
  // access; the author/reader checks below are unchanged. Treated like an
  // author for the published-book and chapter-published gates so drafts can be
  // moderated. Skip the role lookup entirely for the common author path.
  const isModeratorAdmin = isAuthor ? false : (await requireAdminRole()).ok;

  // Authors and admins may preview audio for unpublished books; readers require PUBLISHED.
  if (!isPublished && !isAuthor && !isModeratorAdmin) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  // Authors and admins always have access; for others, delegate to the shared access helper.
  let hasReadAccess = isAuthor || isModeratorAdmin;
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
  // Admins moderating content bypass this gate, like authors.
  if (!isAuthor && !isModeratorAdmin) {
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

  // `chapter_audio_cache` is keyed on (chapter, voice, model, language) — the
  // worker's own cache check at audiobook-worker.ts filters on all four. This
  // route filtered on chapter alone, so after a narrator change readers kept
  // getting the previous voice with no signal that anything was stale.
  //
  // Exact match on the current configuration first, then fall back to the newest
  // row for the chapter. Deliberately NOT a strict filter: every existing row
  // carries the old voice_id, so filtering strictly would make already-generated
  // audiobooks unreachable the moment ELEVENLABS_VOICE_ID changes — taking audio
  // away from readers who paid for it, which is worse than serving an old voice.
  const configuredVoiceId = resolveNarratorVoiceId();
  const configuredModelId =
    (process.env.ELEVENLABS_MODEL_ID ?? "").trim() || "eleven_multilingual_v2";

  const selectCache = () =>
    admin
      .from("chapter_audio_cache")
      .select("audio_path, created_at, voice_id, model_path, language")
      .eq("chapter_id", chapterRow.id);

  let { data: cache, error: cacheError } = configuredVoiceId
    ? await selectCache()
        .eq("voice_id", configuredVoiceId)
        .eq("model_path", configuredModelId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };

  if (!cacheError && !cache) {
    ({ data: cache, error: cacheError } = await selectCache()
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle());

    if (cache && configuredVoiceId) {
      // Visible in logs rather than silent: a narrator change leaves this firing
      // for every chapter until the audiobooks are regenerated.
      console.warn("[audiobook play] serving audio from a non-current voice/model", {
        chapterId: chapterRow.id,
        servedVoiceId: cache.voice_id,
        configuredVoiceId,
        servedModelPath: cache.model_path,
        configuredModelId,
        servedLanguage: cache.language,
      });
    }
  }

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

  // ── WP-03: server-side listen chokepoint ───────────────────────────────────
  //
  // This is the only place that knows a specific caller obtained playable audio
  // for a specific chapter, and it cannot be bypassed — the signed URL above is
  // the sole route to the object, and it expires. `audio_requested` is therefore
  // the floor under every listening metric, including anonymous listeners, whom
  // the client-side events cannot cover because they have no row to own.
  //
  // It is deliberately not called a play: the reader player fetches this on
  // mount with preload="none", so it means "audio was made available". The ratio
  // audio_requested → listen_start (emitted from the real <audio> element via
  // the progress route) is the request-to-play conversion rate.
  //
  // Awaited rather than fire-and-forget: on a serverless host the function can
  // be frozen as soon as the response is returned, which silently drops floating
  // promises — exactly the failure mode that would leave us thinking listening
  // is instrumented when it is not. logAnalyticsEvent never throws and logs its
  // own failures, so this cannot break playback.
  //
  // Run in parallel with the resume lookup below — they are independent, and the
  // reader is blocked on this response before any audio can start.
  const [, resumePositionSeconds] = await Promise.all([
    logAnalyticsEvent(admin, {
      eventType: "audio_requested",
      userId: user?.id ?? null,
      bookId: bookRow.id,
      path: `/api/books/${bookRow.id}/audiobook/play`,
      props: {
        chapterId: chapterRow.id,
        chapterOrder: chapterRow.order,
        signedIn: Boolean(user?.id),
        isAuthorPreview: isAuthor,
        isModeratorAdmin,
      },
    }),
    // Resume point, resolved here rather than from a second endpoint: this
    // request has already done the auth work and the player is already awaiting
    // it, so a separate round trip would only delay playback.
    readResumePosition({
      supabase,
      userId: user?.id ?? null,
      chapterId: chapterRow.id,
    }),
  ]);

  return NextResponse.json({
    audioUrl: signed.signedUrl,
    resumePositionSeconds,
  });
}

/**
 * Saved playback offset for this listener and chapter, or null when there is
 * nothing worth resuming.
 *
 * Read with the caller's session client, so RLS is what scopes the row to its
 * owner. Never rejects: a missing table (migration not yet applied), an RLS
 * surprise or a dropped connection all mean "start from the beginning". Losing a
 * resume point is a small annoyance; failing the audio load over it is not.
 */
async function readResumePosition(input: {
  supabase: SupabaseLikeClient;
  userId: string | null;
  chapterId: string;
}): Promise<number | null> {
  if (!input.userId) return null;

  try {
    const { data, error } = await input.supabase
      .from("listening_positions")
      .select("position_seconds, duration_seconds")
      .eq("user_id", input.userId)
      .eq("chapter_id", input.chapterId)
      .maybeSingle();

    if (error) {
      console.warn("[audiobook play] resume position lookup failed", {
        chapterId: input.chapterId,
        code: error.code,
        message: error.message,
      });
      return null;
    }

    const position = typeof data?.position_seconds === "number" ? data.position_seconds : null;
    const duration = typeof data?.duration_seconds === "number" ? data.duration_seconds : null;

    return shouldResumeAt(position, duration) ? position : null;
  } catch (err) {
    console.warn("[audiobook play] resume position lookup threw", {
      chapterId: input.chapterId,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
