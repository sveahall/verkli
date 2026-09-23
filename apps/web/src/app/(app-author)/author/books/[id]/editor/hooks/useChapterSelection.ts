"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Chapter } from "../bookEditor.shared";
import { useBookWorkspace } from "../workspace/BookWorkspaceProvider";

const CHAPTERS_PER_PAGE = 21;

type Props = {
  chapters: Chapter[];
  initialSelectedChapterId: string | null;
};

export function useChapterSelection({ chapters, initialSelectedChapterId }: Props) {
  const { selectedChapterId, setSelectedChapterId } = useBookWorkspace();
  const [chapterPage, setChapterPage] = useState(() => {
    if (!initialSelectedChapterId) return 0;
    const initialIndex = chapters.findIndex((chapter) => chapter.id === initialSelectedChapterId);
    return Math.floor(Math.max(0, initialIndex) / CHAPTERS_PER_PAGE);
  });

  useEffect(() => {
    setSelectedChapterId(initialSelectedChapterId);
  }, [initialSelectedChapterId, setSelectedChapterId]);

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === selectedChapterId) ?? null,
    [chapters, selectedChapterId]
  );

  const totalPages = Math.ceil(chapters.length / CHAPTERS_PER_PAGE);
  const startIndex = chapterPage * CHAPTERS_PER_PAGE;
  const visibleChapters = chapters.slice(startIndex, startIndex + CHAPTERS_PER_PAGE);
  const selectedChapterIndex = chapters.findIndex((chapter) => chapter.id === selectedChapterId);

  const selectChapter = useCallback(
    (chapterId: string | null) => {
      setSelectedChapterId(chapterId);
    },
    [setSelectedChapterId]
  );

  const selectPreviousChapter = useCallback(() => {
    if (selectedChapterIndex <= 0) return;
    setSelectedChapterId(chapters[selectedChapterIndex - 1]?.id ?? null);
  }, [chapters, selectedChapterIndex, setSelectedChapterId]);

  const selectNextChapter = useCallback(() => {
    if (selectedChapterIndex < 0 || selectedChapterIndex >= chapters.length - 1) return;
    setSelectedChapterId(chapters[selectedChapterIndex + 1]?.id ?? null);
  }, [chapters, selectedChapterIndex, setSelectedChapterId]);

  const setPageForChapterIndex = useCallback((index: number) => {
    setChapterPage(Math.floor(Math.max(0, index) / CHAPTERS_PER_PAGE));
  }, []);

  return {
    CHAPTERS_PER_PAGE,
    chapterPage,
    setChapterPage,
    totalPages,
    startIndex,
    visibleChapters,
    selectedChapterId,
    selectedChapter,
    selectedChapterIndex,
    selectChapter,
    selectPreviousChapter,
    selectNextChapter,
    setSelectedChapterId,
    setPageForChapterIndex,
  };
}
