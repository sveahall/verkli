"use client";

/**
 * ReadingProgress — persists reading progress for the current book.
 *
 * Logged-in users: updates existing `readings` row and inserts if missing.
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
  currentChapter: number;
};

type PostgrestLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function isMissingColumnError(error: PostgrestLikeError | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    text.includes("pgrst204") ||
    text.includes("42703") ||
    (text.includes("column") && text.includes("does not exist")) ||
    (text.includes("could not find") && text.includes("column"))
  );
}

function logDbError(prefix: string, error: PostgrestLikeError | null) {
  console.error(prefix, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });
}

export default function ReadingProgress({ bookId, chapterId, progressPercent, currentChapter }: Props) {
  useEffect(() => {
    const persist = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const payload = { chapterId, progressPercent, updatedAt: Date.now() };

      if (user) {
        const nowIso = new Date().toISOString();
        const baseRow = {
          user_id: user.id,
          book_id: bookId,
          chapter_id: chapterId,
          progress_percent: progressPercent,
        };

        const updateCandidates = [
          {
            chapter_id: chapterId,
            progress_percent: progressPercent,
            current_chapter: currentChapter,
            last_read_at: nowIso,
          },
          {
            chapter_id: chapterId,
            progress_percent: progressPercent,
            updated_at: nowIso,
          },
          {
            chapter_id: chapterId,
            progress_percent: progressPercent,
          },
        ];

        let updatedRows: { id: string }[] | null = null;
        let updateError: PostgrestLikeError | null = null;

        for (const candidate of updateCandidates) {
          const { data, error } = await supabase
            .from("readings")
            .update(candidate)
            .eq("user_id", user.id)
            .eq("book_id", bookId)
            .select("id");

          if (!error) {
            updatedRows = data as { id: string }[] | null;
            updateError = null;
            break;
          }

          updateError = error;
          if (!isMissingColumnError(error)) {
            break;
          }
        }

        if (updateError) {
          logDbError("[ReadingProgress] failed to update reading progress", updateError);
          return;
        }

        if (!updatedRows || updatedRows.length === 0) {
          const insertCandidates = [
            {
              id: crypto.randomUUID(),
              ...baseRow,
              current_chapter: currentChapter,
              last_read_at: nowIso,
              started_at: nowIso,
            },
            {
              id: crypto.randomUUID(),
              ...baseRow,
              updated_at: nowIso,
            },
            {
              id: crypto.randomUUID(),
              ...baseRow,
            },
          ];

          let insertError: PostgrestLikeError | null = null;

          for (const candidate of insertCandidates) {
            const { error } = await supabase
              .from("readings")
              .insert(candidate);

            if (!error) {
              insertError = null;
              break;
            }

            insertError = error;
            if (!isMissingColumnError(error)) {
              break;
            }
          }

          if (insertError) {
            logDbError("[ReadingProgress] failed to insert reading progress", insertError);
          }
        }
      } else {
        try {
          localStorage.setItem(`${STORAGE_KEY_PREFIX}${bookId}`, JSON.stringify(payload));
        } catch {}
      }
    };
    persist();
  }, [bookId, chapterId, currentChapter, progressPercent]);

  return null;
}
