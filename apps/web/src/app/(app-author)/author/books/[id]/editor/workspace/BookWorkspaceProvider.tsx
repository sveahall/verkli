"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { Tool } from "../bookEditor.shared";

export type WorkspaceSurface = "workspace" | "focus";

type BookWorkspaceContextValue = {
  currentBookId: string;
  setCurrentBookId: Dispatch<SetStateAction<string>>;
  selectedChapterId: string | null;
  setSelectedChapterId: Dispatch<SetStateAction<string | null>>;
  activePanel: Tool;
  setActivePanel: Dispatch<SetStateAction<Tool>>;
  activeSurface: WorkspaceSurface;
  setActiveSurface: Dispatch<SetStateAction<WorkspaceSurface>>;
};

const BookWorkspaceContext = createContext<BookWorkspaceContextValue | null>(null);

type Props = {
  bookId: string;
  initialSelectedChapterId: string | null;
  initialActivePanel: Tool;
  initialActiveSurface?: WorkspaceSurface;
  children: ReactNode;
};

export function BookWorkspaceProvider({
  bookId,
  initialSelectedChapterId,
  initialActivePanel,
  initialActiveSurface = "workspace",
  children,
}: Props) {
  const [currentBookId, setCurrentBookId] = useState(bookId);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(initialSelectedChapterId);
  const [activePanel, setActivePanel] = useState<Tool>(initialActivePanel);
  const [activeSurface, setActiveSurface] = useState<WorkspaceSurface>(initialActiveSurface);

  const value = useMemo<BookWorkspaceContextValue>(
    () => ({
      currentBookId,
      setCurrentBookId,
      selectedChapterId,
      setSelectedChapterId,
      activePanel,
      setActivePanel,
      activeSurface,
      setActiveSurface,
    }),
    [activePanel, activeSurface, currentBookId, selectedChapterId]
  );

  return <BookWorkspaceContext.Provider value={value}>{children}</BookWorkspaceContext.Provider>;
}

export function useBookWorkspace() {
  const context = useContext(BookWorkspaceContext);

  if (!context) {
    throw new Error("BookWorkspaceProvider is required.");
  }

  return context;
}
