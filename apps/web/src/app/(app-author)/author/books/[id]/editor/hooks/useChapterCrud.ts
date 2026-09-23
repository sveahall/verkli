"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToastHelpers } from "@/components/ui/toast";
import { normalizeLanguageOrNull } from "@/lib/languages";
import type { Book, BookVersion, Chapter } from "../BookEditorView.types";
import { drainPendingSaves, type PersistChapter } from "./useChapterCrud.autosave";
import { assertReviewCanApply, persistReviewedChapterContent, persistAutosavedChapterContent } from "./useChapterCrud.review";

interface UseChapterCrudOptions {
  book: Book;
  /** Local preview transport; production uses authenticated compare-and-swap. */
  persistContent?: typeof persistReviewedChapterContent;
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

export function useChapterCrud({
  book,
  persistContent = persistReviewedChapterContent,
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
  // Never silently move a mounted draft's baseline to newer server props.
  const expectedContentRef = useRef(new Map(chapters.map((chapter) => [chapter.id, chapter.content])));
  const dirtyRevisionsRef = useRef(new Map<string, number>());
  const queuedRevisionsRef = useRef(new Map<string, number>());
  const revisionRef = useRef(0);
  const conflictIdsRef = useRef(new Set<string>());
  // The write queue: latest unsaved content per chapter id. Every autosave call
  // enqueues here, including the one that goes on to drain it, so a payload can
  // never be written out of order with a newer one for the same chapter.
  const pendingSavesRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const inFlightSavesRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  // Chapters this tab deleted. An autosave still arrives for them: deleting the
  // selected chapter unmounts the editor, and its cleanup flushes the pending
  // debounce after the row is already gone. Without this the resulting zero-row
  // write is re-queued and fails on every later drain, holding the editor in an
  // error state over a chapter the author deliberately deleted.
  const deletedChapterIdsRef = useRef<Set<string>>(new Set());

  const [isSaving, setIsSaving] = useState(false);
  const [isApplyingReview, setIsApplyingReview] = useState(false);
  const [hasSaveConflict, setHasSaveConflict] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null);

  const markChapterDirty = useCallback((chapterId: string | null) => {
    if (!chapterId) return;
    dirtyRevisionsRef.current.set(chapterId, ++revisionRef.current);
    setHasUnsavedChanges(true);
  }, []);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!savingRef.current && !applyingReviewRef.current && !dirtyRevisionsRef.current.size && !pendingSavesRef.current.size) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, []);

  const downloadUnsavedDrafts = useCallback(() => {
    if (Array.from(dirtyRevisionsRef.current).some(([id, revision]) => revision !== queuedRevisionsRef.current.get(id))) {
      toast.error("Your latest typing is still being captured. Pause briefly, then download again.");
      return;
    }
    // The drain removes a queued entry before awaiting its write. Include that
    // in-flight draft too; a newer queued snapshot takes precedence.
    const recoverable = new Map([...inFlightSavesRef.current, ...pendingSavesRef.current]);
    const drafts = Array.from(recoverable, ([id, content]) => ({
      id, title: chapters.find((chapter) => chapter.id === id)?.title ?? "Chapter", content,
    }));
    const url = URL.createObjectURL(new Blob([JSON.stringify({ bookId: book.id, drafts }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "verkli-unsaved-drafts.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [book.id, chapters, toast]);

  const flushPendingSaves = useCallback(async () => {
    // A drain is already running and will pick this up. Returning here is what
    // keeps exactly one writer in flight.
    if (savingRef.current) return;

    savingRef.current = true;
    setIsSaving(true);
    setSaveError(false);

    // Drains the WHOLE queue, not just this chapter's key. See the module
    // comment in ./useChapterCrud.autosave for the ordering rules and the
    // older-over-newer overwrite they replace.
    const persistChapterContent: PersistChapter = async (id, payload) => {
      const queuedRevision = queuedRevisionsRef.current.get(id) ?? 0;
      if (!expectedContentRef.current.has(id)) return { outcome: "missing", serialized: JSON.stringify(payload) };
      inFlightSavesRef.current.set(id, payload);
      const result = await persistAutosavedChapterContent(book.id, id, expectedContentRef.current.get(id) ?? null, payload, persistContent)
        .finally(() => inFlightSavesRef.current.delete(id));
      if (result.outcome === "written") {
        expectedContentRef.current.set(id, result.serialized);
        conflictIdsRef.current.delete(id);
        if ((dirtyRevisionsRef.current.get(id) ?? 0) === queuedRevision) dirtyRevisionsRef.current.delete(id);
      }
      return result;
    };
    const { saved, transientFailures, missingChapters, conflictedChapters } = await drainPendingSaves(
      pendingSavesRef.current,
      persistChapterContent,
      deletedChapterIdsRef.current,
      (id) => {
        conflictIdsRef.current.add(id);
        setHasSaveConflict(true);
        setSaveError(true);
      },
    );

    savingRef.current = false;
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

    conflictedChapters.forEach((id) => conflictIdsRef.current.add(id));
    setHasSaveConflict(conflictIdsRef.current.size > 0);
    if (conflictIdsRef.current.size > 0) {
      setSaveError(true);
      setHasUnsavedChanges(true);
      toast.error("This chapter changed elsewhere. Your unsaved draft is kept in this tab. Download it before reloading.");
      return;
    }

    // Missing first: it is the more serious of the two, and checking transient
    // first meant a drain containing both showed only the reassuring message.
    if (missingChapters.length > 0) {
      setSaveError(true);
      // A reported failure means the payload went back on the queue, so there IS
      // unsaved content. Set this explicitly rather than relying on it still
      // being true from enqueue time — something else may have cleared it.
      setHasUnsavedChanges(true);
      // Deliberately does not claim the chapter is gone. Zero rows cannot tell
      // deletion apart from lost access, so this says what is true of both and
      // still tells the author their text is safe in the tab.
      toast.error("Could not save. That chapter may have been deleted, or your access to it changed. Your text is still here.");
      return;
    }

    if (transientFailures.length > 0) {
      setSaveError(true);
      setHasUnsavedChanges(true);
      // The payload is re-queued, so the words are still in memory. Say that,
      // rather than the old "may not have been persisted", which left an author
      // unsure whether closing the tab would cost them the chapter.
      toast.error("Could not save. Your changes are still here — keep this tab open and try again.");
      return;
    }

    // Only claim saved if the queue is genuinely empty. A keystroke that landed
    // after the drain's last check is still outstanding, and clearing the flag
    // here would show "Saved" over it.
    if (pendingSavesRef.current.size === 0 && dirtyRevisionsRef.current.size === 0) setHasUnsavedChanges(false);
  }, [book.id, persistContent, setChapters, toast]);

  const handleAutoSave = useCallback(async (chapterId: string, jsonContent: Record<string, unknown>) => {
    if (deletedChapterIdsRef.current.has(chapterId)) return;
    if (!expectedContentRef.current.has(chapterId)) {
      const chapter = chapters.find((item) => item.id === chapterId);
      if (chapter) expectedContentRef.current.set(chapterId, chapter.content);
    }
    pendingSavesRef.current.set(chapterId, jsonContent);
    queuedRevisionsRef.current.set(chapterId, dirtyRevisionsRef.current.get(chapterId) ?? 0);
    setHasUnsavedChanges(true);
    await flushPendingSaves();
  }, [chapters, flushPendingSaves]);

  const handleApplyReview = useCallback(async (
    chapterId: string,
    expectedContent: string | null,
    nextContent: Record<string, unknown> | string,
  ): Promise<string> => {
    assertReviewCanApply({
      chapter: chapters.find((chapter) => chapter.id === chapterId),
      expectedContent,
      hasUnsavedChanges: hasUnsavedChanges || dirtyRevisionsRef.current.size > 0,
      isSaving,
      isDraining: savingRef.current,
      pendingCount: pendingSavesRef.current.size,
      isApplying: applyingReviewRef.current,
    });
    applyingReviewRef.current = true;
    savingRef.current = true;
    setIsApplyingReview(true);
    setIsSaving(true);
    try {
      const content = await persistContent(book.id, chapterId, expectedContent, nextContent);
      // An edit that arrived during review still belongs to the old baseline.
      // Keep that baseline so its delayed autosave becomes a recoverable conflict.
      if (!dirtyRevisionsRef.current.has(chapterId) && !pendingSavesRef.current.has(chapterId)) {
        expectedContentRef.current.set(chapterId, content);
      }
      setChapters((current) => current.map((chapter) => (
        chapter.id === chapterId && chapter.content === expectedContent
          ? { ...chapter, content }
          : chapter
      )));
      setLastSaved(new Date());
      // A newly mounted editor may have queued an edit while the request was in flight.
      // Its autosave retains ownership of the pending/saved flags in that case.
      // This operation starts with no unsaved changes, so never clear newer edits.
      if (dirtyRevisionsRef.current.size === 0 && pendingSavesRef.current.size === 0) {
        setSaveError(false);
      }
      return content;
    } finally {
      applyingReviewRef.current = false;
      savingRef.current = false;
      setIsApplyingReview(false);
      setIsSaving(false);
      if (pendingSavesRef.current.size) void flushPendingSaves();
    }
  }, [book.id, chapters, hasUnsavedChanges, isSaving, persistContent, setChapters, flushPendingSaves]);

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
    const supabase = createClient();
    const { error } = await supabase.from("chapters").update({ title: tempTitle.trim() }).eq("id", chapterId);
    setIsSaving(false);
    if (error) {
      setEditingTitleId(null);
      return;
    }
    setChapters(chapters.map((ch) => (ch.id === chapterId ? { ...ch, title: tempTitle.trim() } : ch)));
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
    dirtyRevisionsRef.current.delete(chapterId);
    queuedRevisionsRef.current.delete(chapterId);
    conflictIdsRef.current.delete(chapterId);
    setHasSaveConflict(conflictIdsRef.current.size > 0);
    // If that was the last outstanding work, stop reporting it. The unmount
    // flush that follows is refused by the guard above, so no drain runs to
    // reset these — the editor would otherwise sit on "Unsaved changes" or an
    // error about a chapter the author just deleted, until they edited another.
    // `size === 0` is not the same as "no outstanding work": the drain removes an
    // entry before writing it, so an in-flight write is not in the map. Clearing
    // on that alone told the author everything was saved while a write was still
    // going, and if it then failed the status bar kept saying "Saved".
    if (pendingSavesRef.current.size === 0 && dirtyRevisionsRef.current.size === 0 && !savingRef.current) {
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
    setChapters(newChapters);

    // Two-phase swap via a negative sentinel avoids the UNIQUE(book_id, order)
    // collision that `Promise.all` of two in-place UPDATEs would hit.
    const supabase = createClient();
    const sentinel = -Math.abs(a.order) - 1;
    await supabase.from("chapters").update({ order: sentinel }).eq("id", a.id);
    await supabase.from("chapters").update({ order: a.order }).eq("id", b.id);
    await supabase.from("chapters").update({ order: b.order }).eq("id", a.id);
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

    setChapters(reorderedChapters);

    // Two-phase rewrite to avoid transient duplicate values on the
    // UNIQUE(book_id, order) constraint: move every row to a unique negative
    // sentinel first, then assign the final target slots. Order matters more
    // than speed here — `Promise.all` of overlapping values would race.
    const supabase = createClient();
    for (let i = 0; i < reorderedChapters.length; i++) {
      await supabase
        .from("chapters")
        .update({ order: -(i + 1) })
        .eq("id", reorderedChapters[i].id);
    }
    for (const chapter of reorderedChapters) {
      await supabase
        .from("chapters")
        .update({ order: chapter.order })
        .eq("id", chapter.id);
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
    markChapterDirty,
    isApplyingReview,
    hasSaveConflict,
    downloadUnsavedDrafts,
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
