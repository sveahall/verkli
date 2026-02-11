"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type FontFamily = "serif" | "sans" | "mono";
type TextAlign = "left" | "justify";
type MarginSize = "narrow" | "normal" | "wide";
type ReaderTheme = "light" | "dark";

type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
  fontFamily: FontFamily;
  textAlign: TextAlign;
  marginSize: MarginSize;
  theme: ReaderTheme;
};

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

const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, sans-serif",
  mono: "ui-monospace, 'Cascadia Code', monospace",
};

const MARGIN_WIDTH_MAP: Record<MarginSize, string> = {
  narrow: "640px",
  normal: "800px",
  wide: "960px",
};

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
    fontFamily?: FontFamily;
    textAlign?: TextAlign;
    marginSize?: MarginSize;
    theme?: ReaderTheme;
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
      fontFamily: settings.fontFamily === "serif" || settings.fontFamily === "sans" || settings.fontFamily === "mono" ? settings.fontFamily : undefined,
      textAlign: settings.textAlign === "left" || settings.textAlign === "justify" ? settings.textAlign : undefined,
      marginSize: settings.marginSize === "narrow" || settings.marginSize === "normal" || settings.marginSize === "wide" ? settings.marginSize : undefined,
      theme: settings.theme === "light" || settings.theme === "dark" ? settings.theme : undefined,
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

  const canCreateHighlights = Boolean(userId && bookVersionId);
  const supportsCssHighlights = useMemo(() => {
    return Boolean(getCssHighlightsMap() && getHighlightConstructor());
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

    const prev = lastSavedSettingsRef.current;
    if (
      settings.fontSize === prev.fontSize
      && settings.lineHeight === prev.lineHeight
      && settings.fontFamily === prev.fontFamily
      && settings.textAlign === prev.textAlign
      && settings.marginSize === prev.marginSize
      && settings.theme === prev.theme
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
            fontFamily: settings.fontFamily,
            textAlign: settings.textAlign,
            marginSize: settings.marginSize,
            theme: settings.theme,
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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
    try {
      window.localStorage.setItem("verkli-theme", settings.theme);
    } catch {}
  }, [settings.theme]);

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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-black/10 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600 dark:text-white/60">
              <span className="text-[13px] font-semibold text-slate-900 dark:text-white">Reader settings</span>
              <button
                type="button"
                onClick={() => updateReaderSettings((prev) => ({ ...prev, fontSize: clamp(prev.fontSize - 1, FONT_MIN, FONT_MAX) }))}
                className="rounded-full border border-black/10 px-3 py-1 font-medium text-slate-700 transition hover:border-black/20 hover:text-slate-900 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                aria-label="Decrease text size"
              >
                A-
              </button>
              <span className="min-w-[54px] text-center font-semibold text-slate-900 dark:text-white">{settings.fontSize}px</span>
              <button
                type="button"
                onClick={() => updateReaderSettings((prev) => ({ ...prev, fontSize: clamp(prev.fontSize + 1, FONT_MIN, FONT_MAX) }))}
                className="rounded-full border border-black/10 px-3 py-1 font-medium text-slate-700 transition hover:border-black/20 hover:text-slate-900 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
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
                className="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[12px] font-medium text-slate-800 dark:border-white/15 dark:bg-white/5 dark:text-white"
              >
                {LINE_HEIGHT_OPTIONS.map((value) => (
                  <option key={value} value={String(value)}>{value.toFixed(1)}x</option>
                ))}
              </select>

            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-slate-600 dark:text-white/60">
              <span className="font-medium text-slate-700 dark:text-white/70">Typsnitt</span>
              {(["serif", "sans", "mono"] as const).map((ff) => (
                <button
                  key={ff}
                  type="button"
                  onClick={() => updateReaderSettings((p) => ({ ...p, fontFamily: ff }))}
                  className={`rounded-full border px-3 py-1 font-medium transition ${
                    settings.fontFamily === ff
                      ? "border-[#907AFF]/50 bg-[#907AFF]/10 text-[#907AFF] dark:border-[#907AFF]/40 dark:text-[#b8a9ff]"
                      : "border-black/10 text-slate-700 hover:border-black/20 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                  }`}
                >
                  {ff === "serif" ? "Serif" : ff === "sans" ? "Sans" : "Mono"}
                </button>
              ))}

              <span className="ml-2 font-medium text-slate-700 dark:text-white/70">Justering</span>
              {(["left", "justify"] as const).map((ta) => (
                <button
                  key={ta}
                  type="button"
                  onClick={() => updateReaderSettings((p) => ({ ...p, textAlign: ta }))}
                  className={`rounded-full border px-3 py-1 font-medium transition ${
                    settings.textAlign === ta
                      ? "border-[#907AFF]/50 bg-[#907AFF]/10 text-[#907AFF] dark:border-[#907AFF]/40 dark:text-[#b8a9ff]"
                      : "border-black/10 text-slate-700 hover:border-black/20 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                  }`}
                >
                  {ta === "left" ? "Vänster" : "Marginaljust."}
                </button>
              ))}

              <span className="ml-2 font-medium text-slate-700 dark:text-white/70">Bredd</span>
              {(["narrow", "normal", "wide"] as const).map((ms) => (
                <button
                  key={ms}
                  type="button"
                  onClick={() => updateReaderSettings((p) => ({ ...p, marginSize: ms }))}
                  className={`rounded-full border px-3 py-1 font-medium transition ${
                    settings.marginSize === ms
                      ? "border-[#907AFF]/50 bg-[#907AFF]/10 text-[#907AFF] dark:border-[#907AFF]/40 dark:text-[#b8a9ff]"
                      : "border-black/10 text-slate-700 hover:border-black/20 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                  }`}
                >
                  {ms === "narrow" ? "Smal" : ms === "normal" ? "Normal" : "Bred"}
                </button>
              ))}

              <span className="ml-2 font-medium text-slate-700 dark:text-white/70">Tema</span>
              <button
                type="button"
                onClick={() => updateReaderSettings((p) => ({ ...p, theme: p.theme === "dark" ? "light" : "dark" }))}
                className="rounded-full border border-black/10 px-3 py-1 font-medium text-slate-700 transition hover:border-black/20 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
              >
                {settings.theme === "dark" ? "Ljust" : "Mörkt"}
              </button>

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
            className="reader-chapter-body rounded-2xl border border-black/10 bg-black/[0.02] p-6 dark:border-white/10 dark:bg-white/[0.02]"
            style={{
              ["--reader-font-size" as string]: `${settings.fontSize}px`,
              ["--reader-line-height" as string]: String(settings.lineHeight),
              ["--reader-font-family" as string]: FONT_FAMILY_MAP[settings.fontFamily],
              ["--reader-text-align" as string]: settings.textAlign,
              ["--reader-max-width" as string]: MARGIN_WIDTH_MAP[settings.marginSize],
            }}
          >
            <h2 className="mb-3 text-[18px] font-semibold text-slate-800 dark:text-white/80">{chapterTitle}</h2>
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
        </div>

        <aside className="rounded-2xl border border-black/10 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Highlights</h3>
            <span className="text-[12px] text-slate-500 dark:text-white/50">{highlightCountLabel}</span>
          </div>

          {chapterMessage && (
            <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-200">
              {chapterMessage}
            </p>
          )}

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
                    className="rounded-xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.04]"
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
                      className="mt-3 min-h-[76px] w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80"
                    />

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => updateHighlightNote(highlight.id)}
                        disabled={savingNoteId === highlight.id || !userId}
                        className="rounded-full border border-black/10 px-3 py-1 text-[12px] font-medium text-slate-700 transition hover:border-black/20 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
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
        </aside>
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
          font-family: var(--reader-font-family, Georgia, 'Times New Roman', serif);
          text-align: var(--reader-text-align, left);
          max-width: var(--reader-max-width, 800px);
        }

        .reader-chapter-body .tiptap-renderer .ProseMirror p,
        .reader-chapter-body .tiptap-renderer .ProseMirror li,
        .reader-chapter-body .tiptap-renderer .ProseMirror blockquote {
          line-height: var(--reader-line-height, 1.75);
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
