"use client";

/**
 * ReadingProgress — persists reading progress for the current book.
 *
 * Logged-in users: upserts to `readings` table (server, cross-device).
 * Anonymous users: falls back to localStorage (`verkli_reading_{bookId}`).
 *
 * KNOWN LIMITATION: localStorage progress for anonymous readers is NOT
 * migrated to the `readings` table when the user later signs up / signs in.
 * A future improvement could read all `verkli_reading_*` keys on first
 * authenticated session and bulk-upsert them.
 */

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY_PREFIX = "verkli_reading_";

type Props = {
  bookId: string;
  chapterId: string;
  progressPercent: number;
};

export default function ReadingProgress({ bookId, chapterId, progressPercent }: Props) {
  useEffect(() => {
    const persist = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const payload = { chapterId, progressPercent, updatedAt: Date.now() };

      if (user) {
        await supabase.from("readings").upsert(
          {
            user_id: user.id,
            book_id: bookId,
            chapter_id: chapterId,
            progress_percent: progressPercent,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,book_id" }
        );
      } else {
        try {
          localStorage.setItem(`${STORAGE_KEY_PREFIX}${bookId}`, JSON.stringify(payload));
        } catch {}
      }
    };
    persist();
  }, [bookId, chapterId, progressPercent]);

  return null;
}
