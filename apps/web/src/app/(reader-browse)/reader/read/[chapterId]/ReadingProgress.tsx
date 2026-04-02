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
    const persist = async () => {
      if (userId) {
        const supabase = createClient();
        const { error } = await supabase.from("readings").upsert(
          {
            user_id: userId,
            book_id: bookId,
            chapter_id: chapterId,
            progress_percent: progressPercent,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,book_id" },
        );

        if (error) {
          console.error("[ReadingProgress] upsert failed", {
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
    };
    persist();
  }, [bookId, chapterId, currentChapter, progressPercent, userId]);

  return null;
}
