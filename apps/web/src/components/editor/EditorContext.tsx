"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
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
  // Initialise state from localStorage via lazy initialisers instead of
  // useEffect + setState, avoiding cascading-render warnings.
  const [focusMode, setFocusModeState] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const v = localStorage.getItem(STORAGE_FOCUS);
      return v !== null ? v === "true" : false;
    } catch { return false; }
  });
  const [typeauthorMode, setTypeauthorModeState] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const v = localStorage.getItem(STORAGE_TYPEauthor);
      return v !== null ? v === "true" : false;
    } catch { return false; }
  });
  const [typography, setTypographyState] = useState<TypographyConfig>(() => {
    if (typeof window === "undefined") return defaultTypography;
    try {
      const raw = localStorage.getItem(STORAGE_TYPOGRAPHY(bookId));
      if (raw) {
        const parsed = JSON.parse(raw) as TypographyConfig;
        if (parsed && typeof parsed.fontSize === "number") return parsed;
      }
    } catch { /* ignore */ }
    return defaultTypography;
  });
  const [preset, setPresetState] = useState(() => {
    if (typeof window === "undefined") return "novel";
    try {
      const v = localStorage.getItem(STORAGE_PRESET(bookId));
      if (v) return v;
    } catch { /* ignore */ }
    return "novel";
  });

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
