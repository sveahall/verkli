"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToastHelpers } from "@/components/ui/toast";
import { normalizeLanguageOrNull } from "@/lib/languages";
import type { Book, BookVersion, Chapter } from "../BookEditorView.types";
import { autosaveRetryDelayMs, drainPendingSaves, type PersistChapter } from "./useChapterCrud.autosave";
import { rewriteChapterOrders } from "./useChapterCrud.order";
import { assertReviewCanApply, persistReviewedChapterContent } from "./useChapterCrud.review";

interface UseChapterCrudOptions {
  book: Book;
  activeVersion: BookVersion | null;
  chapters: Chapter[];
  selectedChapterId: string | null;
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
  setSelectedChapterId: (id: string | null) => void;
  setChapterPage: (page: number) => void;
  setSessionStartWords: (n: number | null) => void;
  chaptersPerPage: number;
  getBookWorkspaceHref: (language?: string | null) => string;
}

/**
 * Write one chapter's content and report whether a row was actually touched.
 *
 * `.select("id")` is the point. Without it PostgREST answers `return=minimal`,
 * so an UPDATE that matched NOTHING — the row deleted underneath by an
 * `overwrite_draft` import, or an RLS refusal — came back as `error: null`, the
 * caller saw success, and the status bar said "Saved" over prose that was gone.
 *
 * This depends on the author being able to SELECT their own chapters. They can:
 * `handleCreateChapter` below does `.insert(...).select(...).single()` on this
 * same browser client and surfaces an error otherwise, so chapter creation
 * would already be broken if that were not true. Worth knowing that the repo
 * migrations do NOT grant it — `20260203000000_book_versions.sql:166` drops
 * "Authors can read own chapters" and never recreates it — so this rests on the
 * live database differing from the migrations. If autosave ever starts
 * reporting a failure on every keystroke, that policy is the first thing to
 * check, not this function.
 */
const persistChapterContent: PersistChapter = async (chapterId, payload) => {
  const serialized = JSON.stringify(payload);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("chapters")
    .update({ content: serialized })
    .eq("id", chapterId)
    .select("id");
  if (error) return { outcome: "transient", serialized };
  // Zero rows means the row is gone OR this caller cannot see it, and those are
  // indistinguishable here. Reported as `missing` so the message can say which
  // is more likely, but the payload is still kept queued — see the drain module.
  // Classifying it as permanent and discarding the content would lose prose over
  // a recoverable access problem, which is the opposite of the point.
  if ((data?.length ?? 0) === 0) return { outcome: "missing", serialized };
  return { outcome: "written", serialized };
};

async function persistChapterOrderRows(rows: Array<{ id: string; order: number }>): Promise<boolean> {
  const supabase = createClient();
  return rewriteChapterOrders(rows, async (id, order) => {
    const { data, error } = await supabase
      .from("chapters")
      .update({ order })
      .eq("id", id)
      .select("id");
    return !error && (data?.length ?? 0) > 0;
  });
}

export function useChapterCrud({
  book,
  activeVersion,
  chapters,
  selectedChapterId,
  setChapters,
  setSelectedChapterId,
  setChapterPage,
  setSessionStartWords,
  chaptersPerPage,
  getBookWorkspaceHref,
}: UseChapterCrudOptions) {
  const router = useRouter();
  const toast = useToastHelpers();
  // True while a drain is in flight. One writer at a time; everyone else queues.
  const savingRef = useRef(false);
  const applyingReviewRef = useRef(false);
  // The write queue: latest unsaved content per chapter id. Every autosave call
  // enqueues here, including the one that goes on to drain it, so a payload can
  // never be written out of order with a newer one for the same chapter.
  const pendingSavesRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  // Chapters this tab deleted. An autosave still arrives for them: deleting the
  // selected chapter unmounts the editor, and its cleanup flushes the pending
  // debounce after the row is already gone. Without this the resulting zero-row
  // write is re-queued and fails on every later drain, holding the editor in an
  // error state over a chapter the author deliberately deleted.
  const deletedChapterIdsRef = useRef<Set<string>>(new Set());

  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null);
  const disposedRef = useRef(false);
  const announcedSaveErrorRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const drainQueueRef = useRef<() => Promise<void>>(async () => {});
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback((delayMs: number) => {
    clearRetryTimer();
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void drainQueueRef.current();
    }, delayMs);
  }, [clearRetryTimer]);

  const drainQueue = useCallback(async () => {
    if (disposedRef.current || savingRef.current || pendingSavesRef.current.size === 0) return;

    savingRef.current = true;
    setIsSaving(true);
    setSaveError(false);

    const { saved, transientFailures, missingChapters } = await drainPendingSaves(
      pendingSavesRef.current,
      persistChapterContent,
      deletedChapterIdsRef.current
    );

    savingRef.current = false;
    if (disposedRef.current) {
      if (pendingSavesRef.current.size > 0) {
        void drainPendingSaves(
          pendingSavesRef.current,
          persistChapterContent,
          deletedChapterIdsRef.current
        );
      }
      return;
    }
    setIsSaving(false);

    if (saved.size > 0) {
      setChapters((prev) =>
        prev.map((ch) => {
          const content = saved.get(ch.id);
          return content === undefined ? ch : { ...ch, content };
        })
      );
      setLastSaved(new Date());
    }

    const failed = missingChapters.length > 0 || transientFailures.length > 0;
    if (failed) {
      setSaveError(true);
      setHasUnsavedChanges(true);
      if (!announcedSaveErrorRef.current) {
        announcedSaveErrorRef.current = true;
        toastRef.current.error(
          missingChapters.length > 0
            ? "Could not save. That chapter may have been deleted, or your access to it changed. Your text is still here — we'll keep trying."
            : "Could not save. Your changes are still here — we'll keep trying."
        );
      }
      scheduleRetry(autosaveRetryDelayMs(retryAttemptRef.current));
      retryAttemptRef.current += 1;
      return;
    }

    announcedSaveErrorRef.current = false;
    retryAttemptRef.current = 0;
    if (pendingSavesRef.current.size === 0) {
      clearRetryTimer();
      setHasUnsavedChanges(false);
      return;
    }
    scheduleRetry(0);
  }, [clearRetryTimer, scheduleRetry, setChapters]);

  drainQueueRef.current = drainQueue;

  useEffect(() => {
    disposedRef.current = false;
    const warn = (event: BeforeUnloadEvent) => {
      if (pendingSavesRef.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const retryNow = () => {
      retryAttemptRef.current = 0;
      clearRetryTimer();
      void drainQueueRef.current();
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("online", retryNow);
    return () => {
      disposedRef.current = true;
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("online", retryNow);
      clearRetryTimer();
      if (pendingSavesRef.current.size > 0 && !savingRef.current) {
        void drainPendingSaves(
          pendingSavesRef.current,
          persistChapterContent,
          deletedChapterIdsRef.current
        );
      }
    };
  }, [clearRetryTimer]);

  const handleAutoSave = useCallback(async (chapterId: string, jsonContent: Record<string, unknown>) => {
    if (deletedChapterIdsRef.current.has(chapterId)) return;

    pendingSavesRef.current.set(chapterId, jsonContent);
    setHasUnsavedChanges(true);
    if (savingRef.current) return;

    clearRetryTimer();
    retryAttemptRef.current = 0;
    await drainQueue();
  }, [clearRetryTimer, drainQueue]);

  const handleApplyReview = useCallback(async (
    chapterId: string,
    expectedContent: string | null,
    nextContent: Record<string, unknown>,
  ): Promise<void> => {
    assertReviewCanApply({
      chapter: chapters.find((chapter) => chapter.id === chapterId),
      expectedContent,
      hasUnsavedChanges,
      isSaving,
      isDraining: savingRef.current,
      pendingCount: pendingSavesRef.current.size,
      isApplying: applyingReviewRef.current,
    });
    applyingReviewRef.current = true;
    try {
      const content = await persistReviewedChapterContent(book.id, chapterId, expectedContent, nextContent);
      setChapters((current) => current.map((chapter) => (
        chapter.id === chapterId && chapter.content === expectedContent
          ? { ...chapter, content }
          : chapter
      )));
      setLastSaved(new Date());
      // A newly mounted editor may have queued an edit while the request was in flight.
      // Its autosave retains ownership of the pending/saved flags in that case.
      // This operation starts with no unsaved changes, so never clear newer edits.
      if (!savingRef.current && pendingSavesRef.current.size === 0) {
        setSaveError(false);
      }
    } finally {
      applyingReviewRef.current = false;
    }
  }, [book.id, chapters, hasUnsavedChanges, isSaving, setChapters]);

  const handleCreateChapter = useCallback(async () => {
    setIsCreating(true);
    const supabase = createClient();
    let targetVersionId = activeVersion?.id ?? null;
    let targetVersionLanguage = activeVersion?.language_code ?? null;
    if (!targetVersionId) {
      const fallbackLanguage = normalizeLanguageOrNull(book.original_language ?? book.language) ?? "und";
      const { data: createdVersion, error: versionError } = await supabase
        .from("book_versions")
        .insert({
          book_id: book.id,
          language_code: fallbackLanguage,
          status: "draft",
        })
        .select("id, language_code")
        .single();
      if (versionError || !createdVersion?.id) {
        setIsCreating(false);
        toast.error("Could not create version. Try again.");
        return;
      }
      targetVersionId = createdVersion.id;
      targetVersionLanguage = createdVersion.language_code ?? fallbackLanguage;
      await supabase
        .from("chapters")
        .update({ book_version_id: targetVersionId })
        .eq("book_id", book.id)
        .is("book_version_id", null);
      router.push(getBookWorkspaceHref(targetVersionLanguage));
    }
    const maxOrder = chapters.length > 0 ? Math.max(...chapters.map((ch) => ch.order)) : 0;
    const { data, error } = await supabase
      .from("chapters")
      .insert({
        book_id: book.id,
        book_version_id: targetVersionId,
        title: `Chapter ${maxOrder + 1}`,
        content: "",
        order: maxOrder + 1,
      })
      .select("id, title, content, order, book_version_id")
      .single();
    setIsCreating(false);
    if (error) {
      toast.error("Could not create chapter. Try again.");
      return;
    }
    if (data) {
      const updated = [...chapters, data];
      setChapters(updated);
      setSelectedChapterId(data.id);
      setSessionStartWords(0);
      setChapterPage(Math.floor((updated.length - 1) / chaptersPerPage));
      router.refresh();
    }
  }, [
    activeVersion?.id,
    activeVersion?.language_code,
    book.id,
    book.language,
    book.original_language,
    chapters,
    chaptersPerPage,
    getBookWorkspaceHref,
    router,
    setChapterPage,
    setChapters,
    setSelectedChapterId,
    setSessionStartWords,
    toast,
  ]);

  const handleStartEditTitle = (chapterId: string, currentTitle: string) => {
    setEditingTitleId(chapterId);
    setTempTitle(currentTitle);
  };

  const handleSaveTitle = async (chapterId: string) => {
    if (!tempTitle.trim()) {
      setEditingTitleId(null);
      return;
    }
    setIsSaving(true);
    const title = tempTitle.trim();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("chapters")
      .update({ title })
      .eq("id", chapterId)
      .select("id");
    setIsSaving(false);
    if (error || (data?.length ?? 0) === 0) {
      toast.error("Could not save the chapter title. Try again.");
      return;
    }
    setChapters(chapters.map((ch) => (ch.id === chapterId ? { ...ch, title } : ch)));
    setEditingTitleId(null);
    router.refresh();
  };

  const handleCancelEditTitle = () => {
    setEditingTitleId(null);
    setTempTitle("");
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (chapters.length <= 1) {
      toast.error("Cannot delete the only chapter.");
      return;
    }
    setDeletingChapterId(chapterId);
    const supabase = createClient();

    // Clean up ai_jobs that reference this chapter BEFORE deleting the
    // chapter — otherwise audiobook/translation jobs keep polling a row
    // that no longer exists and their UI surfaces "orphan" chapter titles.
    // `ai_jobs` stores the chapter id inside the `input` JSONB (no FK),
    // so we filter with a JSON path expression.
    await supabase
      .from("ai_jobs")
      .delete()
      .filter("input->>chapterId", "eq", chapterId);

    // Clean up chapter_audio_cache (no FK — must delete manually)
    await supabase.from("chapter_audio_cache").delete().eq("chapter_id", chapterId);

    const { error } = await supabase.from("chapters").delete().eq("id", chapterId);
    if (error) {
      toast.error("Could not delete chapter. Try again.");
      setDeletingChapterId(null);
      return;
    }
    // Recorded only after the row is actually gone, so a failed delete does not
    // start silently discarding that chapter's saves. Setting state below
    // unmounts the editor and flushes its debounce, which is why this has to be
    // in place first.
    deletedChapterIdsRef.current.add(chapterId);
    pendingSavesRef.current.delete(chapterId);
    // If that was the last outstanding work, stop reporting it. The unmount
    // flush that follows is refused by the guard above, so no drain runs to
    // reset these — the editor would otherwise sit on "Unsaved changes" or an
    // error about a chapter the author just deleted, until they edited another.
    // `size === 0` is not the same as "no outstanding work": the drain removes an
    // entry before writing it, so an in-flight write is not in the map. Clearing
    // on that alone told the author everything was saved while a write was still
    // going, and if it then failed the status bar kept saying "Saved".
    if (pendingSavesRef.current.size === 0 && !savingRef.current) {
      setHasUnsavedChanges(false);
      setSaveError(false);
    }
    const remaining = chapters.filter((ch) => ch.id !== chapterId);
    setChapters(remaining);
    if (selectedChapterId === chapterId) {
      setSelectedChapterId(remaining[0]?.id ?? null);
    }
    setDeletingChapterId(null);
    toast.success("Chapter deleted.");
    router.refresh();
  };

  const handleMoveChapter = async (chapterId: string, direction: "up" | "down") => {
    const idx = chapters.findIndex((ch) => ch.id === chapterId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= chapters.length) return;

    const a = chapters[idx];
    const b = chapters[swapIdx];
    const newChapters = [...chapters];
    newChapters[idx] = { ...b, order: a.order };
    newChapters[swapIdx] = { ...a, order: b.order };
    newChapters.sort((x, y) => x.order - y.order);
    const previous = chapters;
    setChapters(newChapters);
    const persisted = await persistChapterOrderRows([
      { id: a.id, order: b.order },
      { id: b.id, order: a.order },
    ]);
    if (!persisted) {
      await persistChapterOrderRows(previous.map((chapter) => ({ id: chapter.id, order: chapter.order })));
      setChapters(previous);
      toast.error("Could not reorder chapters. Try again.");
      return;
    }
    router.refresh();
  };

  const handleReorderChapters = async (sourceChapterId: string, targetChapterId: string) => {
    if (sourceChapterId === targetChapterId) return;

    const orderedChapters = [...chapters].sort((left, right) => left.order - right.order);
    const sourceIndex = orderedChapters.findIndex((chapter) => chapter.id === sourceChapterId);
    const targetIndex = orderedChapters.findIndex((chapter) => chapter.id === targetChapterId);

    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextChapters = [...orderedChapters];
    const [movedChapter] = nextChapters.splice(sourceIndex, 1);
    nextChapters.splice(targetIndex, 0, movedChapter);

    const orderSlots = [...orderedChapters]
      .map((chapter) => chapter.order)
      .sort((left, right) => left - right);
    const reorderedChapters = nextChapters.map((chapter, index) => ({
      ...chapter,
      order: orderSlots[index] ?? index,
    }));

    const previous = orderedChapters;
    setChapters(reorderedChapters);
    const persisted = await persistChapterOrderRows(
      reorderedChapters.map((chapter) => ({ id: chapter.id, order: chapter.order })),
    );
    if (!persisted) {
      await persistChapterOrderRows(previous.map((chapter) => ({ id: chapter.id, order: chapter.order })));
      setChapters(previous);
      toast.error("Could not reorder chapters. Try again.");
      return;
    }

    router.refresh();
  };

  return {
    isSaving,
    isCreating,
    editingTitleId,
    tempTitle,
    setTempTitle,
    lastSaved,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    saveError,
    deletingChapterId,
    setDeletingChapterId,
    handleAutoSave,
    handleApplyReview,
    handleCreateChapter,
    handleStartEditTitle,
    handleSaveTitle,
    handleCancelEditTitle,
    handleDeleteChapter,
    handleMoveChapter,
    handleReorderChapters,
  };
}
