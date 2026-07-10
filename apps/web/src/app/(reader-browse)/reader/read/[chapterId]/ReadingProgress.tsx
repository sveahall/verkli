"use client";

/**
 * ReadingProgress — persists reading progress for the current book.
 *
 * Logged-in users: upserts a `readings` row (keyed on user_id + book_id).
 * Anonymous users: falls back to localStorage (`verkli_reading_{bookId}`).
 *
 * KNOWN LIMITATION: localStorage progress for anonymous readers is NOT
 * migrated to the `readings` table when the user later signs up / signs in.
 */

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY_PREFIX = "verkli_reading_";
// Debounce upserts so a scrolling reader doesn't fire hundreds of Supabase
// writes — previous behaviour wrote on every progress-percent change which
// can easily be 100+/minute on a long chapter.
const PERSIST_DEBOUNCE_MS = 2000;

type Props = {
  bookId: string;
  chapterId: string;
  progressPercent: number;
  currentChapter: number;
  userId: string | null;
};

export default function ReadingProgress({
  bookId,
  chapterId,
  progressPercent,
  currentChapter,
  userId,
}: Props) {
  useEffect(() => {
    const handle = setTimeout(() => {
      void (async () => {
        if (userId) {
          const supabase = createClient();
          const now = new Date().toISOString();

          // Advance-only: reading progress must never regress. Re-opening an
          // earlier chapter of an already-finished book would otherwise
          // overwrite the row backward (e.g. 100% -> 20%), which breaks the
          // "Continue reading" resume point and demotes the book out of the
          // Finished shelf. Gate on the integer current_chapter (monotonic and
          // rounding-safe, unlike the float progress_percent): only persist a
          // full update when we are at or beyond the furthest chapter reached;
          // when re-reading an earlier chapter we still bump last_read_at so
          // recency ordering stays right.
          const { data: existing, error: readError } = await supabase
            .from("readings")
            .select("current_chapter")
            .eq("user_id", userId)
            .eq("book_id", bookId)
            .maybeSingle();

          if (readError) {
            // Could not read stored progress — skip this tick rather than risk
            // overwriting further progress backward. The next debounced write
            // retries once the read succeeds. Best-effort: never interrupts reading.
            console.warn("[ReadingProgress] progress read failed; skipping write", {
              code: readError.code,
              message: readError.message,
            });
            return;
          }

          const storedChapter = existing?.current_chapter ?? -1;
          const advancing = currentChapter >= storedChapter;

          const { error } = advancing
            ? await supabase.from("readings").upsert(
                {
                  user_id: userId,
                  book_id: bookId,
                  chapter_id: chapterId,
                  progress_percent: progressPercent,
                  current_chapter: currentChapter,
                  last_read_at: now,
                },
                { onConflict: "user_id,book_id" },
              )
            : await supabase
                .from("readings")
                .update({ last_read_at: now })
                .eq("user_id", userId)
                .eq("book_id", bookId);

          if (error) {
            // Best-effort background write — a failed progress save must never
            // interrupt reading. Logged at warn level (not error) so it does
            // not surface in the dev error overlay.
            console.warn("[ReadingProgress] upsert failed", {
              code: error.code,
              message: error.message,
              details: error.details,
            });
          }
        } else {
          try {
            const payload = { chapterId, progressPercent, updatedAt: Date.now() };
            localStorage.setItem(`${STORAGE_KEY_PREFIX}${bookId}`, JSON.stringify(payload));
          } catch {
            /* quota exceeded — ignore */
          }
        }
      })();
    }, PERSIST_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [bookId, chapterId, currentChapter, progressPercent, userId]);

  return null;
}
