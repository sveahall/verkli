"use client";

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
        } catch (_) {}
      }
    };
    persist();
  }, [bookId, chapterId, progressPercent]);

  return null;
}
