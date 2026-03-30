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

  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null);

  const handleAutoSave = useCallback(async (chapterId: string, jsonContent: Record<string, unknown>) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(false);
    const supabase = createClient();
    const contentString = JSON.stringify(jsonContent);
    const { error } = await supabase.from("chapters").update({ content: contentString }).eq("id", chapterId);
    savingRef.current = false;
    setIsSaving(false);
    if (error) {
      setSaveError(true);
      toast.error("Could not save. Changes may not have been persisted.");
      return;
    }
    setChapters((prev) => prev.map((ch) => (ch.id === chapterId ? { ...ch, content: contentString } : ch)));
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

    const supabase = createClient();
    await Promise.all([
      supabase.from("chapters").update({ order: a.order }).eq("id", b.id),
      supabase.from("chapters").update({ order: b.order }).eq("id", a.id),
    ]);
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

    const supabase = createClient();
    await Promise.all(
      reorderedChapters.map((chapter) =>
        supabase.from("chapters").update({ order: chapter.order }).eq("id", chapter.id)
      )
    );

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
