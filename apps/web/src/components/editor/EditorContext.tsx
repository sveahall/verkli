"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { TypographyConfig } from "./types";

const STORAGE_FOCUS = "verkli_focus_mode";
const STORAGE_TYPEauthor = "verkli_typeauthor_mode";
const STORAGE_TYPOGRAPHY = (bookId: string) => `verkli_typography_${bookId}`;
const STORAGE_PRESET = (bookId: string) => `verkli_preset_${bookId}`;

type EditorContextValue = {
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
  typeauthorMode: boolean;
  setTypeauthorMode: (v: boolean) => void;
  typography: TypographyConfig;
  setTypography: (v: TypographyConfig) => void;
  preset: string;
  setPreset: (v: string) => void;
  bookId: string | null;
};

const defaultTypography: TypographyConfig = {
  fontFamily: "serif",
  fontSize: 18,
  lineHeight: 1.6,
  paragraphSpacing: 1,
  contentWidth: 65,
};

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({
  children,
  bookId,
}: {
  children: ReactNode;
  bookId: string;
}) {
  const [focusMode, setFocusModeState] = useState(false);
  const [typeauthorMode, setTypeauthorModeState] = useState(false);
  const [typography, setTypographyState] = useState<TypographyConfig>(defaultTypography);
  const [preset, setPresetState] = useState("novel");

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedFocus = localStorage.getItem(STORAGE_FOCUS);
      if (storedFocus !== null) setFocusModeState(storedFocus === "true");

      const storedTypeauthor = localStorage.getItem(STORAGE_TYPEauthor);
      if (storedTypeauthor !== null) setTypeauthorModeState(storedTypeauthor === "true");

      const storedTypo = localStorage.getItem(STORAGE_TYPOGRAPHY(bookId));
      if (storedTypo) {
        const parsed = JSON.parse(storedTypo) as TypographyConfig;
        if (parsed && typeof parsed.fontSize === "number") setTypographyState(parsed);
      }

      const storedPreset = localStorage.getItem(STORAGE_PRESET(bookId));
      if (storedPreset) setPresetState(storedPreset);
    } catch {
      // ignore parse errors
    }
  }, [bookId]);

  const setFocusMode = useCallback((v: boolean) => {
    setFocusModeState(v);
    try {
      localStorage.setItem(STORAGE_FOCUS, String(v));
    } catch {
      // ignore
    }
  }, []);

  const setTypeauthorMode = useCallback((v: boolean) => {
    setTypeauthorModeState(v);
    try {
      localStorage.setItem(STORAGE_TYPEauthor, String(v));
    } catch {
      // ignore
    }
  }, []);

  const setTypography = useCallback(
    (v: TypographyConfig) => {
      setTypographyState(v);
      try {
        localStorage.setItem(STORAGE_TYPOGRAPHY(bookId), JSON.stringify(v));
      } catch {
        // ignore
      }
    },
    [bookId]
  );

  const setPreset = useCallback(
    (v: string) => {
      setPresetState(v);
      try {
        localStorage.setItem(STORAGE_PRESET(bookId), v);
      } catch {
        // ignore
      }
    },
    [bookId]
  );

  const value: EditorContextValue = {
    focusMode,
    setFocusMode,
    typeauthorMode,
    setTypeauthorMode,
    typography,
    setTypography,
    preset,
    setPreset,
    bookId,
  };

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

export function useEditorContext() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditorContext must be used within EditorProvider");
  return ctx;
}
