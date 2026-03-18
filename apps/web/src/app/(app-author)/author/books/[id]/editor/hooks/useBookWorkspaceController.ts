"use client";

import { useCallback, useEffect } from "react";
import type { Tool } from "../bookEditor.shared";
import { TOOL_ORDER } from "../bookEditor.shared";
import { useBookWorkspace } from "../workspace/BookWorkspaceProvider";

type Props = {
  bookId: string;
  visibleTools?: Tool[];
};

export function useBookWorkspaceController({ bookId, visibleTools }: Props) {
  const {
    currentBookId,
    setCurrentBookId,
    activePanel,
    setActivePanel,
    activeSurface,
    setActiveSurface,
    selectedChapterId,
    setSelectedChapterId,
  } = useBookWorkspace();

  const effectiveTools = visibleTools ?? TOOL_ORDER;
  const focusMode = activeSurface === "focus";

  useEffect(() => {
    setCurrentBookId(bookId);
  }, [bookId, setCurrentBookId]);

  const setFocusMode = useCallback(
    (value: boolean | ((previous: boolean) => boolean)) => {
      setActiveSurface((previousSurface) => {
        const previousValue = previousSurface === "focus";
        const nextValue =
          typeof value === "function" ? value(previousValue) : value;
        return nextValue ? "focus" : "workspace";
      });
    },
    [setActiveSurface]
  );

  return {
    currentBookId,
    activePanel,
    setActivePanel,
    activeSurface,
    focusMode,
    setFocusMode,
    selectedChapterId,
    setSelectedChapterId,
    effectiveTools,
  };
}
