import type { PersistResult } from "./useChapterCrud.autosave";
import { createClient } from "@/lib/supabase/client";

const STALE_REVIEW_MESSAGE = "This chapter changed or is no longer accessible. Reload it and run the review again before accepting changes.";

export class ChapterContentConflictError extends Error {}

export function assertReviewCanApply(state: {
  chapter: { id: string; content: string | null } | undefined;
  expectedContent: string | null;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isDraining: boolean;
  pendingCount: number;
  isApplying: boolean;
}): void {
  if (state.hasUnsavedChanges || state.isSaving || state.isDraining || state.pendingCount > 0 || state.isApplying) {
    throw new Error("Finish saving your changes before accepting a review suggestion.");
  }
  if (!state.chapter || state.chapter.content !== state.expectedContent) {
    throw new ChapterContentConflictError(STALE_REVIEW_MESSAGE);
  }
}

/** A review may replace exactly the source text it examined, never a newer draft. */
export async function persistReviewedChapterContent(
  bookId: string,
  chapterId: string,
  expectedContent: string | null,
  nextContent: Record<string, unknown> | string,
): Promise<string> {
  const supabase = createClient();
  const { data: chapter, error: readError } = await supabase
    .from("chapters")
    .select("id, content, updated_at, version_number")
    .eq("book_id", bookId)
    .eq("id", chapterId)
    .maybeSingle();
  if (readError) {
    throw new Error("Could not read the chapter before saving the review. Your suggestion has not been accepted. Try again.");
  }
  if (!chapter || chapter.id !== chapterId || chapter.content !== expectedContent ||
      typeof chapter.updated_at !== "string" || !chapter.updated_at.trim() ||
      !Number.isSafeInteger(chapter.version_number) || chapter.version_number < 0) {
    throw new ChapterContentConflictError(STALE_REVIEW_MESSAGE);
  }

  const serialized = typeof nextContent === "string" ? nextContent : JSON.stringify(nextContent);
  // Keep timestamp precision and also compare the existing content revision: two
  // updates in one transaction can share now(), but version_number still advances.
  // Never put a potentially long chapter in URL filters.
  const { data, error } = await supabase
    .from("chapters")
    .update({ content: serialized })
    .eq("book_id", bookId)
    .eq("id", chapterId)
    .eq("updated_at", chapter.updated_at)
    .eq("version_number", chapter.version_number)
    .select("id");
  if (error) {
    throw new Error("Could not save the review changes. Your suggestion has not been accepted. Try again.");
  }
  if (!data?.some((row) => row.id === chapterId)) {
    throw new ChapterContentConflictError(STALE_REVIEW_MESSAGE);
  }
  return serialized;
}

/** Normal typing uses the same compare-and-swap as review acceptance. */
export async function persistAutosavedChapterContent(
  bookId: string,
  chapterId: string,
  expectedContent: string | null,
  payload: Record<string, unknown>,
  persistContent = persistReviewedChapterContent,
): Promise<PersistResult> {
  const serialized = JSON.stringify(payload);
  try {
    await persistContent(bookId, chapterId, expectedContent, payload);
    return { outcome: "written", serialized };
  } catch (error) {
    return { outcome: error instanceof ChapterContentConflictError ? "conflict" : "transient", serialized };
  }
}
