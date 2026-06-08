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
          const { error } = await supabase.from("readings").upsert(
            {
              user_id: userId,
              book_id: bookId,
              chapter_id: chapterId,
              progress_percent: progressPercent,
              current_chapter: currentChapter,
              last_read_at: now,
            },
            { onConflict: "user_id,book_id" },
          );

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
