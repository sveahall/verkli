/**
 * POST /api/books/[id]/audiobook/progress — WP-03.
 *
 * Two jobs, one round trip:
 *   1. persist the reader's playback position (`listening_positions`), so
 *      pausing an audiobook no longer loses their place;
 *   2. emit the client-side listening events (`listen_start`, `listen_progress`,
 *      `listen_complete`) that until now did not exist anywhere in the app.
 *
 * They share an endpoint because they share a moment and a payload: "the reader
 * paused at 04:12" is both the position to store and the progress event to
 * record. Splitting them would double the auth work and the request count on a
 * path that fires several times a minute during playback.
 *
 * The position is written with the **caller's session client** so RLS enforces
 * ownership even if this handler has a bug. The analytics row is written with
 * the **admin client**: `analytics_events` has no SELECT policy and an INSERT
 * policy that only accepts `auth.uid() = user_id OR user_id IS NULL`, so
 * service-role is the only emission path that is correct for every actor
 * (reader, author previewing, admin moderating). See the RLS note in
 * `lib/analytics/events.ts`.
 *
 * Everything here is best-effort telemetry. A failure must never interrupt
 * playback, so storage problems are logged and reported as `saved: false`
 * rather than raised as a 5xx the player would have to handle.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserReadBook } from "@/lib/books/access";
import { assertPublicEnv } from "@/lib/env";
import { isAudiobookEnabled } from "@/lib/flags";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { logAnalyticsEvent } from "@/lib/analytics/events";
import {
  LISTEN_EVENT_TYPES,
  RESUME_TAIL_MARGIN_SECONDS,
  listenPercent,
  type ListenProgressResponse,
} from "@/lib/analytics/listen";
import {
  apiError,
  E_AUDIOBOOK_FEATURE_DISABLED,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_FORBIDDEN,
  E_INVALID_BOOK_ID,
  E_INVALID_JSON,
  E_NOT_AUTHENTICATED,
  E_RATE_LIMIT_EXCEEDED,
  E_VALIDATION_FAILED,
  isValidUuid,
} from "@/lib/api-errors";

/**
 * Playback writes at `POSITION_SAVE_INTERVAL_MS` (15s) are 4/min, plus a
 * debounced write per pause and per seek burst. 40/min leaves an order of
 * magnitude of headroom for a reader scrubbing around, while still capping what
 * a scripted client can push into `analytics_events`.
 */
const limiter = createPerUserRateLimiter({ maxPerMinute: 40 });

/** Longest plausible chapter, as a sanity bound on client-reported numbers. */
const MAX_POSITION_SECONDS = 24 * 60 * 60;

const bodySchema = z.object({
  chapterId: z.string().uuid(),
  positionSeconds: z.number().finite().min(0).max(MAX_POSITION_SECONDS),
  durationSeconds: z
    .number()
    .finite()
    .positive()
    .max(MAX_POSITION_SECONDS)
    .nullish(),
  event: z.enum(LISTEN_EVENT_TYPES).nullish(),
});

type BookRow = {
  id: string;
  status: string | null;
  author_id: string | null;
  price_amount: number | null;
  pricing_model: string | null;
};

/** Postgres/PostgREST codes meaning "this table isn't there yet". */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  if (!isAudiobookEnabled()) {
    return apiError(E_AUDIOBOOK_FEATURE_DISABLED, 503);
  }

  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A position row needs an owner, so anonymous listeners get no persistence.
  // Their listening is still measured: `audio_requested` is emitted server-side
  // by the play route for every signed URL it issues, signed in or not.
  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const rate = await limiter.check(user.id);
  if (!rate.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { chapterId, positionSeconds, durationSeconds, event } = parsed.data;

  // Admin client for lookups so RLS cannot hide a row and turn a real 403 into
  // a confusing 404 — same reasoning as the play route.
  const admin = createAdminClient();

  const { data: chapter, error: chapterError } = await admin
    .from("chapters")
    .select("id, book_id")
    .eq("id", chapterId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (chapterError) {
    console.error("[audiobook progress] chapter fetch failed", {
      chapterId,
      bookId,
      message: chapterError.message,
    });
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
    console.error("[audiobook progress] book fetch failed", {
      bookId,
      message: bookError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const bookRow = book as BookRow | null;
  if (!bookRow) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const isAuthor = bookRow.author_id === user.id;
  const isPublished = String(bookRow.status ?? "").toUpperCase() === "PUBLISHED";

  if (!isPublished && !isAuthor) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  // Book-level paywall gate. The chapter-published gate deliberately is NOT
  // repeated here: it lives in the play route, which is what actually hands out
  // audio, and a stored offset for a chapter you cannot hear is inert. Adding
  // the `book_versions` lookup would cost a query on every 15s write for no
  // access that isn't already denied upstream.
  const hasReadAccess =
    isAuthor ||
    (await canUserReadBook({
      supabase,
      userId: user.id,
      bookId: bookRow.id,
      bookAuthorId: bookRow.author_id,
      bookPriceAmount: bookRow.price_amount,
      bookPricingModel: bookRow.pricing_model,
    }));

  if (!hasReadAccess) {
    return apiError(E_FORBIDDEN, 403);
  }

  const resolvedDuration =
    typeof durationSeconds === "number" ? durationSeconds : null;

  // Completion is `completed` becoming true, and it is one-way. `listen_complete`
  // means the media element fired `ended`; the duration comparison also catches a
  // reader who scrubs into the last seconds and leaves.
  const reachedEnd =
    event === "listen_complete" ||
    (resolvedDuration != null &&
      positionSeconds >= resolvedDuration - RESUME_TAIL_MARGIN_SECONDS);

  // `completed` is omitted rather than set to false when the chapter is not
  // finished. PostgREST's merge-duplicates upsert only writes the keys present
  // in the payload, so omitting it leaves an existing `true` alone (sticky) and
  // still gets `false` from the column default on insert. This is what makes
  // completion stick without a read-modify-write round trip — unlike
  // `ReadingProgress`, which must read `current_chapter` first because its
  // *position* is advance-only.
  //
  // The position itself is deliberately last-write-wins, NOT advance-only:
  // rewinding an audiobook is a normal listening action and the reader means it.
  // That is the one place this diverges from ReadingProgress, whose advance-only
  // guard exists to stop re-opening chapter 2 of a finished book from demoting
  // it out of the Finished shelf. Audio has no such shelf, and clamping here
  // would strand a listener wherever they last got to.
  const row: Record<string, unknown> = {
    user_id: user.id,
    book_id: bookRow.id,
    chapter_id: chapterId,
    position_seconds: positionSeconds,
    duration_seconds: resolvedDuration,
    // Written explicitly as well as by the update_updated_at_column trigger, so
    // the user+book+updated_at resume index stays correct even if the trigger is
    // missing on a drifted database.
    updated_at: new Date().toISOString(),
  };
  if (reachedEnd) {
    row.completed = true;
  }

  const { error: upsertError } = await supabase
    .from("listening_positions")
    .upsert(row, { onConflict: "user_id,chapter_id" });

  let saved = true;
  if (upsertError) {
    saved = false;
    const missingTable = MISSING_TABLE_CODES.has(upsertError.code ?? "");
    // warn, not error: a lost position must not page anyone and must not surface
    // in the dev error overlay mid-playback. A missing table means
    // 20260818120000_listening_positions.sql has not been applied yet.
    console.warn("[audiobook progress] position upsert failed", {
      bookId: bookRow.id,
      chapterId,
      code: upsertError.code,
      message: upsertError.message,
      hint: missingTable
        ? "apply supabase/migrations/20260818120000_listening_positions.sql"
        : undefined,
    });
  }

  if (event) {
    await logAnalyticsEvent(admin, {
      eventType: event,
      userId: user.id,
      bookId: bookRow.id,
      path: `/api/books/${bookRow.id}/audiobook/progress`,
      props: {
        chapterId,
        positionSeconds: Math.round(positionSeconds),
        durationSeconds: resolvedDuration == null ? null : Math.round(resolvedDuration),
        percent: listenPercent(positionSeconds, resolvedDuration),
        completed: reachedEnd,
        isAuthorPreview: isAuthor,
      },
    });
  }

  const payload: ListenProgressResponse = { ok: true, saved };
  return NextResponse.json(payload);
}
