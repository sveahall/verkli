"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import TiptapRenderer from "@/components/editor/TiptapRenderer";
import { createClient } from "@/lib/supabase/client";

type HighlightColor = "yellow" | "green" | "blue" | "rose";

type ReaderHighlight = {
  id: string;
  startOffset: number;
  endOffset: number;
  snippet: string;
  color: HighlightColor;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
  fontFamily?: "serif" | "sans" | "mono";
  textAlign?: "left" | "center" | "justify";
  marginSize?: "narrow" | "normal" | "wide";
  theme?: "light" | "sepia" | "dark";
};

type ReaderFont = "serif" | "sans" | "mono";
type ReaderTheme = "light" | "sepia" | "dark";
type ReaderThemeOption = {
  value: ReaderTheme;
  label: string;
  preview: string;
  canvas: string;
  orbOne: string;
  orbTwo: string;
  orbThree: string;
  veil: string;
  gridColor: string;
  panelBg: string;
  panelBorder: string;
  chapterBg: string;
  chapterBorder: string;
  proseColor: string;
  headingColor: string;
  linkUnderline: string;
  linkUnderlineHover: string;
};

const FONT_OPTIONS: { value: ReaderFont; label: string; family: string }[] = [
  { value: "serif", label: "Serif", family: "Georgia, serif" },
  { value: "sans", label: "Sans", family: "Inter, system-ui, sans-serif" },
  { value: "mono", label: "Mono", family: "'JetBrains Mono', monospace" },
];

const THEME_OPTIONS: ReaderThemeOption[] = [
  {
    value: "light",
    label: "Light",
    preview: "linear-gradient(140deg, #eef3ff 10%, #f6f9ff 55%, #eef4ff 100%)",
    canvas: "linear-gradient(165deg, #eef3ff 0%, #f7fbff 48%, #edf5ff 100%)",
    orbOne: "rgba(144,122,255,0.56)",
    orbTwo: "rgba(125,211,252,0.46)",
    orbThree: "rgba(248,180,230,0.38)",
    veil: "linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.08) 100%)",
    gridColor: "rgba(116, 139, 179, 0.22)",
    panelBg: "rgba(255,255,255,0.78)",
    panelBorder: "rgba(148,163,184,0.34)",
    chapterBg: "linear-gradient(180deg, rgba(255,255,255,0.9), rgba(252,255,255,0.86))",
    chapterBorder: "rgba(148,163,184,0.34)",
    proseColor: "#1e293b",
    headingColor: "#0f172a",
    linkUnderline: "rgba(100,116,139,0.45)",
    linkUnderlineHover: "rgba(71,85,105,0.75)",
  },
  {
    value: "sepia",
    label: "Sepia",
    preview: "linear-gradient(140deg, #f7efe2 5%, #f4e7d4 55%, #f0e2cf 100%)",
    canvas: "linear-gradient(165deg, #f8f0e4 0%, #f4e8d8 48%, #efe1cc 100%)",
    orbOne: "rgba(245, 158, 11, 0.32)",
    orbTwo: "rgba(236, 72, 153, 0.22)",
    orbThree: "rgba(239, 68, 68, 0.14)",
    veil: "linear-gradient(180deg, rgba(255,250,240,0.34) 0%, rgba(251,244,232,0.1) 100%)",
    gridColor: "rgba(156, 120, 84, 0.18)",
    panelBg: "rgba(253,247,236,0.75)",
    panelBorder: "rgba(180,138,104,0.34)",
    chapterBg: "linear-gradient(180deg, rgba(255,251,243,0.86), rgba(251,242,226,0.82))",
    chapterBorder: "rgba(171,133,101,0.34)",
    proseColor: "#5b4633",
    headingColor: "#402f1f",
    linkUnderline: "rgba(146,98,63,0.46)",
    linkUnderlineHover: "rgba(126,78,45,0.74)",
  },
  {
    value: "dark",
    label: "Dark",
    preview: "linear-gradient(140deg, #10182c 10%, #0f172a 58%, #111f36 100%)",
    canvas: "linear-gradient(165deg, #0f172a 0%, #10192f 54%, #0a1222 100%)",
    orbOne: "rgba(147, 112, 219, 0.46)",
    orbTwo: "rgba(34, 211, 238, 0.28)",
    orbThree: "rgba(59, 130, 246, 0.22)",
    veil: "linear-gradient(180deg, rgba(15,23,42,0.34) 0%, rgba(2,6,23,0.18) 100%)",
    gridColor: "rgba(116, 139, 179, 0.2)",
    panelBg: "rgba(15,23,42,0.58)",
    panelBorder: "rgba(148,163,184,0.24)",
    chapterBg: "linear-gradient(180deg, rgba(15,23,42,0.76), rgba(13,17,29,0.7))",
    chapterBorder: "rgba(148,163,184,0.24)",
    proseColor: "rgba(241,245,249,0.92)",
    headingColor: "rgba(248,250,252,0.96)",
    linkUnderline: "rgba(203,213,225,0.5)",
    linkUnderlineHover: "rgba(226,232,240,0.78)",
  },
];

function loadLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocalStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // silent
  }
}

type SelectionState = {
  startOffset: number;
  endOffset: number;
  snippet: string;
  x: number;
  y: number;
  placement: "top" | "bottom";
};

type TextNodeIndex = {
  node: Text;
  start: number;
  end: number;
};

type HighlightRecord = {
  id: string;
  start_offset: number;
  end_offset: number;
  snippet: string;
  color: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  userId: string | null;
  bookId: string;
  bookVersionId: string;
  chapterId: string;
  chapterContent: string | Record<string, unknown> | null;
  chapterTitle: string;
  initialHighlights: ReaderHighlight[];
  initialPreferences: Record<string, unknown> | null;
  initialSettings: ReaderSettings;
};

const FONT_MIN = 13;
const FONT_MAX = 24;
const LINE_HEIGHT_OPTIONS = [1.5, 1.7, 1.9, 2.1] as const;
const COLOR_ORDER: HighlightColor[] = ["yellow", "green", "blue", "rose"];
const COLOR_META: Record<HighlightColor, { label: string; swatch: string }> = {
  yellow: { label: "Yellow", swatch: "#facc15" },
  green: { label: "Green", swatch: "#86efac" },
  blue: { label: "Blue", swatch: "#93c5fd" },
  rose: { label: "Rose", swatch: "#fda4af" },
};
const HIGHLIGHT_BUCKETS: Record<HighlightColor, string> = {
  yellow: "reader-highlight-yellow",
  green: "reader-highlight-green",
  blue: "reader-highlight-blue",
  rose: "reader-highlight-rose",
};

type CssHighlightsMap = {
  set(name: string, value: unknown): void;
  delete(name: string): void;
};

type HighlightConstructor = new (...ranges: Range[]) => unknown;

type ReaderPrefs = {
  settings?: {
    fontSize?: number;
    lineHeight?: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeColor(value: unknown): HighlightColor {
  if (value === "yellow" || value === "green" || value === "blue" || value === "rose") {
    return value;
  }
  return "yellow";
}

function normalizeHighlights(input: ReaderHighlight[]): ReaderHighlight[] {
  return [...input].sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
    return a.endOffset - b.endOffset;
  });
}

function getCssHighlightsMap(): CssHighlightsMap | null {
  if (typeof CSS === "undefined") return null;
  const maybeCss = CSS as unknown as { highlights?: CssHighlightsMap };
  if (!maybeCss.highlights) return null;
  if (typeof maybeCss.highlights.set !== "function" || typeof maybeCss.highlights.delete !== "function") {
    return null;
  }
  return maybeCss.highlights;
}

function getHighlightConstructor(): HighlightConstructor | null {
  if (typeof window === "undefined") return null;
  const maybeWindow = window as unknown as { Highlight?: HighlightConstructor };
  if (!maybeWindow.Highlight) return null;
  return maybeWindow.Highlight;
}

function collectTextNodeIndex(root: HTMLElement): TextNodeIndex[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: TextNodeIndex[] = [];
  let cursor = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof Text)) continue;
    const text = node.textContent ?? "";
    if (!text.length) continue;

    const start = cursor;
    const end = start + text.length;
    nodes.push({ node, start, end });
    cursor = end;
  }

  return nodes;
}

function createRangeFromOffsets(index: TextNodeIndex[], startOffset: number, endOffset: number): Range | null {
  if (!index.length) return null;
  if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || endOffset <= startOffset) return null;

  const totalLength = index[index.length - 1]?.end ?? 0;
  if (totalLength <= 0) return null;

  const start = clamp(startOffset, 0, totalLength);
  const end = clamp(endOffset, 0, totalLength);
  if (end <= start) return null;

  let startNode: Text | null = null;
  let startNodeOffset = 0;
  let endNode: Text | null = null;
  let endNodeOffset = 0;

  for (const entry of index) {
    if (!startNode && start >= entry.start && start <= entry.end) {
      startNode = entry.node;
      startNodeOffset = start - entry.start;
    }

    if (!endNode && end >= entry.start && end <= entry.end) {
      endNode = entry.node;
      endNodeOffset = end - entry.start;
    }

    if (startNode && endNode) break;
  }

  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode, clamp(startNodeOffset, 0, startNode.textContent?.length ?? 0));
  range.setEnd(endNode, clamp(endNodeOffset, 0, endNode.textContent?.length ?? 0));
  return range;
}

function parseHighlightRecord(value: unknown): ReaderHighlight | null {
  if (!isRecord(value)) return null;

  const id = String(value.id ?? "").trim();
  const snippet = String(value.snippet ?? "").trim();
  const startOffset = Number(value.start_offset ?? NaN);
  const endOffset = Number(value.end_offset ?? NaN);

  if (!id || !snippet || !Number.isFinite(startOffset) || !Number.isFinite(endOffset) || endOffset <= startOffset) {
    return null;
  }

  return {
    id,
    snippet,
    startOffset,
    endOffset,
    color: normalizeColor(value.color),
    note: value.note == null ? null : String(value.note),
    createdAt: String(value.created_at ?? ""),
    updatedAt: String(value.updated_at ?? ""),
  };
}

function getReaderPrefs(preferences: Record<string, unknown>): ReaderPrefs {
  const reader = preferences.reader;
  if (!isRecord(reader)) return {};
  const settings = reader.settings;
  if (!isRecord(settings)) return {};

  return {
    settings: {
      fontSize: typeof settings.fontSize === "number" ? settings.fontSize : undefined,
      lineHeight: typeof settings.lineHeight === "number" ? settings.lineHeight : undefined,
    },
  };
}

export default function ReaderChapterClient({
  userId,
  bookId,
  bookVersionId,
  chapterId,
  chapterContent,
  chapterTitle,
  initialHighlights,
  initialPreferences,
  initialSettings,
}: Props) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const settingsSaveTimeoutRef = useRef<number | null>(null);
  const settingsStatusResetTimeoutRef = useRef<number | null>(null);
  const preferencesRef = useRef<Record<string, unknown>>(initialPreferences ?? {});
  const lastSavedSettingsRef = useRef<ReaderSettings>(initialSettings);

  const [highlights, setHighlights] = useState<ReaderHighlight[]>(() => normalizeHighlights(initialHighlights));
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [selectedColor, setSelectedColor] = useState<HighlightColor>("yellow");
  const [newNote, setNewNote] = useState("");
  const [creatingHighlight, setCreatingHighlight] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialHighlights.map((item) => [item.id, item.note ?? ""]))
  );
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(initialSettings);
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [chapterMessage, setChapterMessage] = useState<string | null>(null);
  const [showHighlightsPanel, setShowHighlightsPanel] = useState(false);

  // Reader UX controls
  const [readerFont, setReaderFont] = useState<ReaderFont>("serif");
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>("light");
  const [backgroundIntensity, setBackgroundIntensity] = useState(72);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  // Hydrate client-side preferences after mount to avoid SSR/client mismatches.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const nextFont = loadLocalStorage("verkli_reader_font", "serif" as ReaderFont);
      const nextTheme = loadLocalStorage("verkli_reader_theme", "light" as ReaderTheme);
      const nextIntensityRaw = Number(loadLocalStorage("verkli_reader_bg_intensity", 72));
      const nextIntensity = Number.isFinite(nextIntensityRaw) ? clamp(nextIntensityRaw, 20, 100) : 72;
      setReaderFont((prev) => (prev === nextFont ? prev : nextFont));
      setReaderTheme((prev) => (prev === nextTheme ? prev : nextTheme));
      setBackgroundIntensity((prev) => (prev === nextIntensity ? prev : nextIntensity));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Persist UX controls to localStorage
  useEffect(() => { saveLocalStorage("verkli_reader_font", readerFont); }, [readerFont]);
  useEffect(() => { saveLocalStorage("verkli_reader_theme", readerTheme); }, [readerTheme]);
  useEffect(() => { saveLocalStorage("verkli_reader_bg_intensity", backgroundIntensity); }, [backgroundIntensity]);

  // Close settings panel on click outside
  useEffect(() => {
    if (!showSettingsPanel) return;
    const handler = (e: MouseEvent) => {
      if (
        settingsPanelRef.current &&
        !settingsPanelRef.current.contains(e.target as Node) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(e.target as Node)
      ) {
        setShowSettingsPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSettingsPanel]);

  const currentFontFamily = FONT_OPTIONS.find((f) => f.value === readerFont)?.family ?? "Georgia, serif";
  const currentTheme = THEME_OPTIONS.find((t) => t.value === readerTheme) ?? THEME_OPTIONS[0];
  const orbOpacity = 0.1 + (backgroundIntensity / 100) * 0.42;
  const gridOpacity = 0.03 + (backgroundIntensity / 100) * 0.11;

  const canCreateHighlights = Boolean(userId && bookVersionId);
  const [supportsCssHighlights, setSupportsCssHighlights] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const nextValue = Boolean(getCssHighlightsMap() && getHighlightConstructor());
      setSupportsCssHighlights((prev) => (prev === nextValue ? prev : nextValue));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const updateReaderSettings = useCallback((updater: (prev: ReaderSettings) => ReaderSettings) => {
    setSettings((prev) => updater(prev));
    if (userId) {
      setSettingsSaveState("saving");
    }
  }, [userId]);

  const proseRoot = useCallback((): HTMLElement | null => {
    if (!contentRef.current) return null;
    return contentRef.current.querySelector(".ProseMirror");
  }, []);

  const clearCssHighlightBuckets = useCallback(() => {
    const map = getCssHighlightsMap();
    if (!map) return;
    for (const color of COLOR_ORDER) {
      map.delete(HIGHLIGHT_BUCKETS[color]);
    }
  }, []);

  const applyCssHighlights = useCallback((): boolean => {
    const map = getCssHighlightsMap();
    const HighlightCtor = getHighlightConstructor();
    const root = proseRoot();
    if (!map || !HighlightCtor || !root) {
      return false;
    }

    clearCssHighlightBuckets();
    const index = collectTextNodeIndex(root);
    if (!index.length) return true;

    const groups: Record<HighlightColor, Range[]> = {
      yellow: [],
      green: [],
      blue: [],
      rose: [],
    };

    for (const item of highlights) {
      const range = createRangeFromOffsets(index, item.startOffset, item.endOffset);
      if (!range) continue;
      groups[item.color].push(range);
    }

    for (const color of COLOR_ORDER) {
      if (groups[color].length === 0) continue;
      map.set(HIGHLIGHT_BUCKETS[color], new HighlightCtor(...groups[color]));
    }

    return true;
  }, [clearCssHighlightBuckets, highlights, proseRoot]);

  useEffect(() => {
    let rafId: number | null = null;
    let attempts = 0;

    const attemptApply = () => {
      const applied = applyCssHighlights();
      if (applied || attempts >= 24) return;
      attempts += 1;
      rafId = window.requestAnimationFrame(attemptApply);
    };

    attemptApply();

    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [applyCssHighlights]);

  useEffect(() => {
    return () => {
      clearCssHighlightBuckets();
    };
  }, [clearCssHighlightBuckets]);

  useEffect(() => {
    const updateSelection = () => {
      const root = proseRoot();
      if (!root) return;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setSelectionState(null);
        return;
      }

      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setSelectionState(null);
        return;
      }

      if (!(range.startContainer instanceof Text) || !(range.endContainer instanceof Text)) {
        setSelectionState(null);
        return;
      }

      const normalizedSnippet = selection
        .toString()
        .replace(/\s+/g, " ")
        .trim();

      if (!normalizedSnippet) {
        setSelectionState(null);
        return;
      }

      const index = collectTextNodeIndex(root);
      if (!index.length) {
        setSelectionState(null);
        return;
      }

      const startEntry = index.find((entry) => entry.node === range.startContainer);
      const endEntry = index.find((entry) => entry.node === range.endContainer);
      if (!startEntry || !endEntry) {
        setSelectionState(null);
        return;
      }

      const rawStart = startEntry.start + range.startOffset;
      const rawEnd = endEntry.start + range.endOffset;
      const startOffset = Math.min(rawStart, rawEnd);
      const endOffset = Math.max(rawStart, rawEnd);
      if (endOffset <= startOffset) {
        setSelectionState(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      const x = clamp(rect.left + rect.width / 2, 24, window.innerWidth - 24);
      const placeOnTop = rect.top > 140;
      const y = placeOnTop ? rect.top - 10 : rect.bottom + 10;

      setSelectedColor("yellow");
      setNewNote("");
      setSelectionState({
        startOffset,
        endOffset,
        snippet: normalizedSnippet.slice(0, 260),
        x,
        y,
        placement: placeOnTop ? "top" : "bottom",
      });
    };

    const handleMouseUp = () => {
      window.setTimeout(updateSelection, 0);
    };

    const handleKeyUp = () => {
      window.setTimeout(updateSelection, 0);
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [proseRoot]);

  useEffect(() => {
    if (!userId) return;

    if (
      settings.fontSize === lastSavedSettingsRef.current.fontSize
      && settings.lineHeight === lastSavedSettingsRef.current.lineHeight
    ) {
      return;
    }

    if (settingsSaveTimeoutRef.current != null) {
      window.clearTimeout(settingsSaveTimeoutRef.current);
    }

    settingsSaveTimeoutRef.current = window.setTimeout(async () => {
      const supabase = createClient();
      const existingPreferences = preferencesRef.current;
      const existingReaderPrefs = getReaderPrefs(existingPreferences);

      const nextPreferences: Record<string, unknown> = {
        ...existingPreferences,
        reader: {
          ...(isRecord(existingPreferences.reader) ? existingPreferences.reader : {}),
          ...existingReaderPrefs,
          settings: {
            fontSize: settings.fontSize,
            lineHeight: settings.lineHeight,
          },
        },
      };

      const { error } = await supabase
        .from("profiles")
        .upsert({
          user_id: userId,
          preferences: nextPreferences,
        }, { onConflict: "user_id" });

      if (error) {
        setSettingsSaveState("error");
        return;
      }

      preferencesRef.current = nextPreferences;
      lastSavedSettingsRef.current = settings;
      setSettingsSaveState("saved");

      if (settingsStatusResetTimeoutRef.current != null) {
        window.clearTimeout(settingsStatusResetTimeoutRef.current);
      }
      settingsStatusResetTimeoutRef.current = window.setTimeout(() => {
        setSettingsSaveState("idle");
      }, 1200);
    }, 450);

    return () => {
      if (settingsSaveTimeoutRef.current != null) {
        window.clearTimeout(settingsSaveTimeoutRef.current);
      }
    };
  }, [settings, userId]);

  useEffect(() => {
    return () => {
      if (settingsSaveTimeoutRef.current != null) {
        window.clearTimeout(settingsSaveTimeoutRef.current);
      }
      if (settingsStatusResetTimeoutRef.current != null) {
        window.clearTimeout(settingsStatusResetTimeoutRef.current);
      }
    };
  }, []);

  const createHighlight = useCallback(async () => {
    if (!selectionState) return;

    if (!userId) {
      setChapterMessage("Sign in to save highlights.");
      return;
    }

    if (!bookVersionId) {
      setChapterMessage("This chapter version could not be resolved.");
      return;
    }

    setCreatingHighlight(true);
    setChapterMessage(null);

    const supabase = createClient();
    const payload = {
      user_id: userId,
      book_id: bookId,
      book_version_id: bookVersionId,
      chapter_id: chapterId,
      start_offset: selectionState.startOffset,
      end_offset: selectionState.endOffset,
      snippet: selectionState.snippet,
      color: selectedColor,
      note: newNote.trim() ? newNote.trim() : null,
    };

    const { data, error } = await supabase
      .from("highlights" as never)
      .insert(payload as never)
      .select("id, start_offset, end_offset, snippet, color, note, created_at, updated_at")
      .maybeSingle();

    setCreatingHighlight(false);

    if (error) {
      if (error.code === "23505") {
        setChapterMessage("That text is already highlighted.");
      } else {
        setChapterMessage("Could not save highlight right now.");
      }
      return;
    }

    const parsed = parseHighlightRecord(data as unknown);
    if (!parsed) {
      setChapterMessage("Highlight saved, but UI could not refresh this item.");
      return;
    }

    setHighlights((prev) => normalizeHighlights([...prev, parsed]));
    setNoteDrafts((prev) => ({ ...prev, [parsed.id]: parsed.note ?? "" }));
    setSelectionState(null);
    setNewNote("");
    window.getSelection()?.removeAllRanges();
  }, [bookId, bookVersionId, chapterId, newNote, selectedColor, selectionState, userId]);

  const updateHighlightNote = useCallback(async (highlightId: string) => {
    if (!userId) return;

    const nextNote = (noteDrafts[highlightId] ?? "").trim();
    setSavingNoteId(highlightId);
    setChapterMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("highlights" as never)
      .update({ note: nextNote ? nextNote : null } as never)
      .eq("id", highlightId);

    setSavingNoteId(null);

    if (error) {
      setChapterMessage("Could not save note.");
      return;
    }

    setHighlights((prev) => prev.map((item) => {
      if (item.id !== highlightId) return item;
      return {
        ...item,
        note: nextNote ? nextNote : null,
      };
    }));
  }, [noteDrafts, userId]);

  const deleteHighlight = useCallback(async (highlightId: string) => {
    if (!userId) return;

    setDeletingId(highlightId);
    setChapterMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("highlights" as never)
      .delete()
      .eq("id", highlightId);

    setDeletingId(null);

    if (error) {
      setChapterMessage("Could not delete highlight.");
      return;
    }

    setHighlights((prev) => prev.filter((item) => item.id !== highlightId));
    setNoteDrafts((prev) => {
      const next = { ...prev };
      delete next[highlightId];
      return next;
    });
  }, [userId]);

  const scrollToHighlight = useCallback((highlight: ReaderHighlight) => {
    const root = proseRoot();
    if (!root) return;

    const range = createRangeFromOffsets(collectTextNodeIndex(root), highlight.startOffset, highlight.endOffset);
    if (!range) return;

    const rect = range.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - 170;
    window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
  }, [proseRoot]);

  const settingsStatusLabel = settingsSaveState === "saving"
    ? "Saving"
    : settingsSaveState === "saved"
      ? "Saved"
      : settingsSaveState === "error"
        ? "Save failed"
        : "";

  const highlightCountLabel = highlights.length === 1
    ? "1 highlight"
    : `${highlights.length} highlights`;

  return (
    <>
      {/* Floating settings gear button */}
      <div className="fixed right-4 top-[calc(env(safe-area-inset-top,0px)+6rem)] z-[100]">
        <button
          ref={settingsButtonRef}
          type="button"
          onClick={() => setShowSettingsPanel((prev) => !prev)}
          className="rounded-full border border-slate-200 bg-white/95 p-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-white dark:border-white/15 dark:bg-slate-800 dark:hover:bg-slate-700"
          aria-label="Reader settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700 dark:text-white/80">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {showSettingsPanel && (
          <div
            ref={settingsPanelRef}
            className="absolute right-0 top-12 w-[270px] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_20px_44px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-slate-900"
          >
            <p className="mb-3 text-[13px] font-semibold text-slate-900 dark:text-white">L&auml;sinst&auml;llningar</p>

            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">Typsnitt</p>
                <div className="flex gap-1.5">
                  {FONT_OPTIONS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setReaderFont(f.value)}
                      className={`flex-1 rounded-xl px-2 py-1.5 text-[12px] font-medium transition ${
                        readerFont === f.value
                          ? "bg-[#907AFF] text-white"
                          : "border border-black/10 text-slate-700 hover:border-black/20 dark:border-white/15 dark:text-white/70"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">Tema</p>
                <div className="flex gap-1.5">
                  {THEME_OPTIONS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setReaderTheme(t.value)}
                      className={`flex-1 rounded-xl border px-2 py-1.5 text-[12px] font-medium transition ${
                        readerTheme === t.value
                          ? "border-[#907AFF]/45 bg-[#907AFF] text-white"
                          : "border-black/10 text-slate-700 hover:border-black/20 dark:border-white/15 dark:text-white/70"
                      }`}
                    >
                      <span className="mx-auto mb-1.5 block h-2.5 w-10 rounded-full" style={{ background: t.preview }} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">Bakgrund</p>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-white/60">{backgroundIntensity}%</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={100}
                  step={5}
                  value={backgroundIntensity}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (!Number.isFinite(next)) return;
                    setBackgroundIntensity(clamp(next, 20, 100));
                  }}
                  className="w-full accent-[#907AFF]"
                  aria-label="Background intensity"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="relative overflow-hidden rounded-[30px] p-2 sm:p-3" style={{ background: currentTheme.canvas }}>
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div
            className="absolute -left-20 -top-24 h-[320px] w-[320px] rounded-full blur-[92px]"
            style={{ backgroundColor: currentTheme.orbOne, opacity: orbOpacity }}
          />
          <div
            className="absolute -right-16 top-[18%] h-[280px] w-[280px] rounded-full blur-[88px]"
            style={{ backgroundColor: currentTheme.orbTwo, opacity: orbOpacity * 0.92 }}
          />
          <div
            className="absolute bottom-[-96px] left-[22%] h-[300px] w-[300px] rounded-full blur-[96px]"
            style={{ backgroundColor: currentTheme.orbThree, opacity: orbOpacity * 0.8 }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(${currentTheme.gridColor} 1px, transparent 1px), linear-gradient(90deg, ${currentTheme.gridColor} 1px, transparent 1px)`,
              backgroundSize: "30px 30px",
              opacity: gridOpacity,
            }}
          />
          <div className="absolute inset-0" style={{ background: currentTheme.veil }} />
        </div>

        <div className="relative space-y-5">
          <section
            className="rounded-[24px] border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)]"
            style={{ background: currentTheme.panelBg, borderColor: currentTheme.panelBorder }}
          >
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600 dark:text-white/60">
              <span className="text-[13px] font-semibold text-slate-900 dark:text-white">Reader settings</span>
              <button
                type="button"
                onClick={() => updateReaderSettings((prev) => ({ ...prev, fontSize: clamp(prev.fontSize - 1, FONT_MIN, FONT_MAX) }))}
                className="rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                aria-label="Decrease text size"
              >
                A-
              </button>
              <span className="min-w-[54px] text-center font-semibold text-slate-900 dark:text-white">{settings.fontSize}px</span>
              <button
                type="button"
                onClick={() => updateReaderSettings((prev) => ({ ...prev, fontSize: clamp(prev.fontSize + 1, FONT_MIN, FONT_MAX) }))}
                className="rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                aria-label="Increase text size"
              >
                A+
              </button>

              <label htmlFor="reader-line-height" className="ml-2 font-medium text-slate-700 dark:text-white/70">
                Line spacing
              </label>
              <select
                id="reader-line-height"
                value={String(settings.lineHeight)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  updateReaderSettings((prev) => ({ ...prev, lineHeight: next }));
                }}
                className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[12px] font-medium text-slate-800 dark:border-white/15 dark:bg-white/5 dark:text-white"
              >
                {LINE_HEIGHT_OPTIONS.map((value) => (
                  <option key={value} value={String(value)}>{value.toFixed(1)}x</option>
                ))}
              </select>

              {userId && settingsStatusLabel && (
                <span className={`ml-auto font-medium ${
                  settingsSaveState === "error"
                    ? "text-red-600 dark:text-red-300"
                    : "text-emerald-700 dark:text-emerald-300"
                }`}
                >
                  {settingsStatusLabel}
                </span>
              )}
            </div>
          </section>

          <div
            ref={contentRef}
            className="reader-chapter-body rounded-[30px] border px-7 py-8 shadow-[0_18px_36px_rgba(15,23,42,0.08)] sm:px-11 sm:py-11"
            style={{
              ["--reader-font-size" as string]: `${settings.fontSize}px`,
              ["--reader-line-height" as string]: String(settings.lineHeight),
              ["--reader-font-family" as string]: currentFontFamily,
              ["--reader-prose-color" as string]: currentTheme.proseColor,
              ["--reader-heading-color" as string]: currentTheme.headingColor,
              ["--reader-link-underline" as string]: currentTheme.linkUnderline,
              ["--reader-link-underline-hover" as string]: currentTheme.linkUnderlineHover,
              background: currentTheme.chapterBg,
              borderColor: currentTheme.chapterBorder,
            }}
          >
            <h2
              className="mb-5 text-center text-[clamp(1.65rem,2.2vw,2.1rem)] font-semibold tracking-tight"
              style={{ color: "var(--reader-heading-color, #0f172a)" }}
            >
              {chapterTitle}
            </h2>
            {chapterContent ? (
              <TiptapRenderer content={chapterContent} />
            ) : (
              <p className="text-[15px] text-slate-600 dark:text-white/60">No content yet.</p>
            )}
          </div>

          {!supportsCssHighlights && (
            <p className="text-[12px] text-slate-500 dark:text-white/50">
              This browser cannot draw inline highlights yet. Your saved highlights still appear in the panel.
            </p>
          )}

          {!userId && (
            <p className="text-[13px] text-slate-600 dark:text-white/60">
              <Link
                href={`/reader/signin?next=${encodeURIComponent(`/reader/read/${chapterId}`)}`}
                className="font-semibold text-[#7058DD] hover:text-[#5f49c8]"
              >
                Sign in
              </Link>{" "}
              to save highlights and reading settings.
            </p>
          )}

          <section
            className="rounded-[24px] border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)]"
            style={{ background: currentTheme.panelBg, borderColor: currentTheme.panelBorder }}
          >
            <button
              type="button"
              onClick={() => setShowHighlightsPanel((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex items-center gap-3">
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Highlights</h3>
                <span className="text-[12px] text-slate-500 dark:text-white/50">{highlightCountLabel}</span>
              </div>
              <span className="text-[12px] font-medium text-slate-600 dark:text-white/60">
                {showHighlightsPanel ? "Hide" : "Show"}
              </span>
            </button>

            {chapterMessage && (
              <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-200">
                {chapterMessage}
              </p>
            )}

            {showHighlightsPanel && (
              <>
                {highlights.length === 0 ? (
                  <p className="mt-4 text-[13px] text-slate-600 dark:text-white/60">
                    Select text in this chapter to add your first highlight.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {highlights.map((highlight) => {
                      const colorMeta = COLOR_META[highlight.color];
                      return (
                        <article
                          key={highlight.id}
                          className="rounded-xl border border-slate-200 bg-white/85 p-3 dark:border-white/10 dark:bg-white/[0.04]"
                        >
                          <button
                            type="button"
                            onClick={() => scrollToHighlight(highlight)}
                            className="w-full text-left"
                          >
                            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-white/50">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorMeta.swatch }} />
                              {colorMeta.label}
                            </div>
                            <p className="mt-2 text-[13px] leading-relaxed text-slate-800 dark:text-white/80">“{highlight.snippet}”</p>
                          </button>

                          <textarea
                            value={noteDrafts[highlight.id] ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              setNoteDrafts((prev) => ({ ...prev, [highlight.id]: value }));
                            }}
                            placeholder="Add a note"
                            className="mt-3 min-h-[76px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80"
                          />

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => updateHighlightNote(highlight.id)}
                              disabled={savingNoteId === highlight.id || !userId}
                              className="rounded-full border border-slate-200 px-3 py-1 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                            >
                              {savingNoteId === highlight.id ? "Saving..." : "Save note"}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteHighlight(highlight.id)}
                              disabled={deletingId === highlight.id || !userId}
                              className="rounded-full border border-red-200 px-3 py-1 text-[12px] font-medium text-red-600 transition hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/40 dark:text-red-300"
                            >
                              {deletingId === highlight.id ? "Removing..." : "Remove"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {selectionState && (
        <div
          className={`fixed z-[120] w-[300px] rounded-2xl border border-black/10 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-slate-900 ${
            selectionState.placement === "top" ? "-translate-x-1/2 -translate-y-full" : "-translate-x-1/2"
          }`}
          style={{ left: selectionState.x, top: selectionState.y }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <p className="line-clamp-2 text-[12px] text-slate-600 dark:text-white/60">“{selectionState.snippet}”</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {COLOR_ORDER.map((color) => {
              const active = color === selectedColor;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                    active
                      ? "border-[#907AFF]/50 bg-[#907AFF]/10 text-slate-900 dark:text-white"
                      : "border-black/10 text-slate-600 hover:border-black/20 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLOR_META[color].swatch }} />
                  {COLOR_META[color].label}
                </button>
              );
            })}
          </div>

          <textarea
            value={newNote}
            onChange={(event) => setNewNote(event.target.value)}
            placeholder="Optional note"
            className="mt-3 min-h-[72px] w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/15 dark:bg-white/[0.03] dark:text-white/80"
          />

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectionState(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="rounded-full border border-black/10 px-3 py-1 text-[12px] font-medium text-slate-700 transition hover:border-black/20 hover:text-slate-900 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={creatingHighlight || !canCreateHighlights}
              onClick={createHighlight}
              className="rounded-full bg-[#907AFF] px-4 py-1 text-[12px] font-semibold text-white transition hover:bg-[#8069EE] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingHighlight ? "Saving..." : "Save highlight"}
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        .reader-chapter-body .tiptap-renderer .ProseMirror {
          font-size: var(--reader-font-size, 16px);
          line-height: var(--reader-line-height, 1.75);
          font-family: var(--reader-font-family, Georgia, serif);
          max-width: 78ch;
          margin-left: auto;
          margin-right: auto;
          color: var(--reader-prose-color, #1e293b);
          text-wrap: pretty;
        }

        .reader-chapter-body .tiptap-renderer .ProseMirror a {
          color: inherit;
          text-decoration: underline;
          text-decoration-color: var(--reader-link-underline, rgba(100, 116, 139, 0.45));
          text-underline-offset: 2px;
          transition: text-decoration-color 180ms ease;
        }

        .reader-chapter-body .tiptap-renderer .ProseMirror a:hover {
          text-decoration-color: var(--reader-link-underline-hover, rgba(71, 85, 105, 0.75));
        }

        .reader-chapter-body .tiptap-renderer .ProseMirror p,
        .reader-chapter-body .tiptap-renderer .ProseMirror li,
        .reader-chapter-body .tiptap-renderer .ProseMirror blockquote {
          line-height: var(--reader-line-height, 1.75);
          color: inherit;
        }

        ::highlight(reader-highlight-yellow) {
          background-color: rgba(250, 204, 21, 0.38);
          color: inherit;
        }

        ::highlight(reader-highlight-green) {
          background-color: rgba(134, 239, 172, 0.34);
          color: inherit;
        }

        ::highlight(reader-highlight-blue) {
          background-color: rgba(147, 197, 253, 0.34);
          color: inherit;
        }

        ::highlight(reader-highlight-rose) {
          background-color: rgba(253, 164, 175, 0.34);
          color: inherit;
        }
      `}</style>
    </>
  );
}

export type { ReaderHighlight, ReaderSettings, HighlightRecord };
