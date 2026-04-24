"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToastHelpers } from "@/components/ui/toast";
import { normalizeLanguage } from "@/lib/languages";
import type { Book, BookVersion, Chapter } from "../BookEditorView.types";

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
  const savingRef = useRef(false);
  // Latest keystroke content keyed by chapter id, captured while a save is
  // already in flight. When the in-flight save finishes we flush these so no
  // input is silently dropped (the previous behaviour was to `return` when a
  // save was in flight, leaving new keystrokes unpersisted).
  const pendingSavesRef = useRef<Map<string, Record<string, unknown>>>(new Map());

  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null);

  const handleAutoSave = useCallback(async (chapterId: string, jsonContent: Record<string, unknown>) => {
    // If a save is already running, record the latest content instead of
    // dropping it — we'll flush after the in-flight save completes.
    if (savingRef.current) {
      pendingSavesRef.current.set(chapterId, jsonContent);
      setHasUnsavedChanges(true);
      return;
    }

    // Inner loop flushes any keystrokes that arrived during a save. Defined
    // locally so the outer callback does not need to self-reference.
    async function persistOnce(id: string, payload: Record<string, unknown>): Promise<{ ok: boolean; serialized: string }> {
      const serialized = JSON.stringify(payload);
      const supabase = createClient();
      const { error } = await supabase
        .from("chapters")
        .update({ content: serialized })
        .eq("id", id);
      return { ok: !error, serialized };
    }

    savingRef.current = true;
    setIsSaving(true);
    setSaveError(false);

    let currentPayload = jsonContent;
    let persisted: { ok: boolean; serialized: string } = { ok: false, serialized: "" };
    // Loop until no more pending writes exist for this chapter — guarantees
    // the final keystroke is persisted even if several arrive while saving.
    while (true) {
      persisted = await persistOnce(chapterId, currentPayload);
      if (!persisted.ok) break;
      const queued = pendingSavesRef.current.get(chapterId);
      if (!queued) break;
      pendingSavesRef.current.delete(chapterId);
      currentPayload = queued;
    }

    savingRef.current = false;
    setIsSaving(false);

    if (!persisted.ok) {
      setSaveError(true);
      toast.error("Could not save. Changes may not have been persisted.");
      return;
    }

    const lastSerialized = persisted.serialized;
    setChapters((prev) => prev.map((ch) => (ch.id === chapterId ? { ...ch, content: lastSerialized } : ch)));
    setLastSaved(new Date());
    setHasUnsavedChanges(false);
  }, [setChapters, toast]);

  const handleCreateChapter = useCallback(async () => {
    setIsCreating(true);
    const supabase = createClient();
    let targetVersionId = activeVersion?.id ?? null;
    let targetVersionLanguage = activeVersion?.language_code ?? null;
    if (!targetVersionId) {
      const fallbackLanguage = normalizeLanguage(book.original_language ?? book.language);
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
    setHasUnsavedChanges,
    saveError,
    deletingChapterId,
    setDeletingChapterId,
    handleAutoSave,
    handleCreateChapter,
    handleStartEditTitle,
    handleSaveTitle,
    handleCancelEditTitle,
    handleDeleteChapter,
    handleMoveChapter,
    handleReorderChapters,
  };
}
