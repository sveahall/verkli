"use client";

import { createContext, useCallback, useContext } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { CommandPaletteItem } from "@/components/editor/CommandPalette";

type BookWorkspaceCommandPaletteContextValue = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  commands: CommandPaletteItem[];
  setCommands: Dispatch<SetStateAction<CommandPaletteItem[]>>;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
};

const BookWorkspaceCommandPaletteContext = createContext<BookWorkspaceCommandPaletteContextValue | null>(null);

type Props = {
  children: ReactNode;
};

export function BookWorkspaceCommandPaletteProvider({ children }: Props) {
  const setOpen: Dispatch<SetStateAction<boolean>> = useCallback((nextState) => {
    const shouldOpen =
      typeof nextState === "function" ? nextState(false) : nextState;
    window.dispatchEvent(
      new CustomEvent(shouldOpen ? "author-shell:open-command-palette" : "author-shell:close-command-palette")
    );
  }, []);

  const setCommands: Dispatch<SetStateAction<CommandPaletteItem[]>> = useCallback((nextCommands) => {
    const resolvedCommands =
      typeof nextCommands === "function" ? nextCommands([]) : nextCommands;
    window.dispatchEvent(
      new CustomEvent("author-shell:set-command-items", {
        detail: resolvedCommands,
      })
    );
  }, []);

  const value: BookWorkspaceCommandPaletteContextValue = {
    open: false,
    setOpen,
    commands: [],
    setCommands,
    openPalette: () => {
      window.dispatchEvent(new CustomEvent("author-shell:open-command-palette"));
    },
    closePalette: () => {
      window.dispatchEvent(new CustomEvent("author-shell:close-command-palette"));
    },
    togglePalette: () => {
      window.dispatchEvent(new CustomEvent("author-shell:open-command-palette"));
    },
  };

  return (
    <BookWorkspaceCommandPaletteContext.Provider value={value}>
      {children}
    </BookWorkspaceCommandPaletteContext.Provider>
  );
}

export function BookWorkspaceCommandPaletteHost() {
  return null;
}

export function useBookWorkspaceCommandPalette() {
  const context = useContext(BookWorkspaceCommandPaletteContext);

  if (!context) {
    throw new Error("BookWorkspaceCommandPaletteProvider is required.");
  }

  return context;
}
