"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import ReaderChapterBody from "./components/ReaderChapterBody";
import ReaderChapterGlobalStyles from "./components/ReaderChapterGlobalStyles";
import ReaderHighlightComposer from "./components/ReaderHighlightComposer";
import ReaderHighlightsPanel from "./components/ReaderHighlightsPanel";
import ReaderSettingsPanel from "./components/ReaderSettingsPanel";
import {
  COLOR_ORDER,
  HIGHLIGHT_BUCKETS,
  FONT_OPTIONS,
  THEME_OPTIONS,
  clamp,
  collectTextNodeIndex,
  createRangeFromOffsets,
  getCssHighlightsMap,
  getHighlightConstructor,
  getReaderPrefs,
  isRecord,
  loadLocalStorage,
  normalizeHighlights,
  parseHighlightRecord,
  saveLocalStorage,
  type HighlightColor,
  type ReaderFont,
  type ReaderHighlight,
  type ReaderSettings,
  type ReaderTheme,
  type SelectionState,
  type TextNodeIndex,
} from "./ReaderChapterClient.helpers";

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
  const textNodeIndexRef = useRef<TextNodeIndex[] | null>(null);
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
  const chapterBodyStyle = useMemo<Record<string, string>>(() => ({
    ["--reader-font-size"]: `${settings.fontSize}px`,
    ["--reader-line-height"]: String(settings.lineHeight),
    ["--reader-font-family"]: currentFontFamily,
    ["--reader-prose-color"]: currentTheme.proseColor,
    ["--reader-heading-color"]: currentTheme.headingColor,
    ["--reader-link-underline"]: currentTheme.linkUnderline,
    ["--reader-link-underline-hover"]: currentTheme.linkUnderlineHover,
    background: currentTheme.chapterBg,
    borderColor: currentTheme.chapterBorder,
  }), [currentFontFamily, currentTheme, settings.fontSize, settings.lineHeight]);
  // Background intensity preserved for settings panel but orbs/grid removed
  void backgroundIntensity;

  const canCreateHighlights = Boolean(userId && bookVersionId);

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

  useEffect(() => {
    textNodeIndexRef.current = null;
  }, [chapterContent, chapterId]);

  const getTextNodeIndex = useCallback((): TextNodeIndex[] => {
    const cached = textNodeIndexRef.current;
    if (cached) {
      return cached;
    }

    const root = proseRoot();
    if (!root) {
      return [];
    }

    const nextIndex = collectTextNodeIndex(root);
    textNodeIndexRef.current = nextIndex;
    return nextIndex;
  }, [proseRoot]);

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
    const index = getTextNodeIndex();
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
  }, [clearCssHighlightBuckets, getTextNodeIndex, highlights, proseRoot]);

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

      const index = getTextNodeIndex();
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
  }, [getTextNodeIndex, proseRoot]);

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

    const range = createRangeFromOffsets(getTextNodeIndex(), highlight.startOffset, highlight.endOffset);
    if (!range) return;

    const rect = range.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - 170;
    window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
  }, [getTextNodeIndex, proseRoot]);

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
      <ReaderSettingsPanel
        userId={userId}
        showSettingsPanel={showSettingsPanel}
        settingsButtonRef={settingsButtonRef}
        settingsPanelRef={settingsPanelRef}
        settingsSaveState={settingsSaveState}
        settingsStatusLabel={settingsStatusLabel}
        settings={settings}
        readerFont={readerFont}
        readerTheme={readerTheme}
        backgroundIntensity={backgroundIntensity}
        onToggle={() => setShowSettingsPanel((prev) => !prev)}
        onUpdateReaderSettings={updateReaderSettings}
        onFontChange={setReaderFont}
        onThemeChange={setReaderTheme}
        onBackgroundIntensityChange={setBackgroundIntensity}
      />

      <div className="space-y-4">
        <ReaderChapterBody
          ref={contentRef}
          chapterTitle={chapterTitle}
          chapterContent={chapterContent}
          bodyStyle={chapterBodyStyle}
        />

        {!userId && (
          <p className="text-sm text-[#64748B] dark:text-white/60">
            <Link
              href={`/reader/signin?next=${encodeURIComponent(`/reader/read/${chapterId}`)}`}
              className="font-semibold text-[#907AFF] transition-colors hover:text-[#7A66E0]"
            >
              Sign in
            </Link>{" "}
            to save highlights and reading settings.
          </p>
        )}

        {highlights.length > 0 && (
        <ReaderHighlightsPanel
          highlightCountLabel={highlightCountLabel}
          showHighlightsPanel={showHighlightsPanel}
          chapterMessage={chapterMessage}
          highlights={highlights}
          noteDrafts={noteDrafts}
          savingNoteId={savingNoteId}
          deletingId={deletingId}
          userId={userId}
          onToggle={() => setShowHighlightsPanel((prev) => !prev)}
          onNoteDraftChange={(highlightId, value) =>
            setNoteDrafts((prev) => ({ ...prev, [highlightId]: value }))
          }
          onSaveNote={updateHighlightNote}
          onDeleteHighlight={deleteHighlight}
          onScrollToHighlight={scrollToHighlight}
        />
        )}
      </div>

      {selectionState && (
        <ReaderHighlightComposer
          selectionState={selectionState}
          selectedColor={selectedColor}
          newNote={newNote}
          creatingHighlight={creatingHighlight}
          canCreateHighlights={canCreateHighlights}
          onColorChange={setSelectedColor}
          onNoteChange={setNewNote}
          onCancel={() => {
            setSelectionState(null);
            window.getSelection()?.removeAllRanges();
          }}
          onSave={createHighlight}
        />
      )}
      <ReaderChapterGlobalStyles />
    </>
  );
}

export type { HighlightRecord, ReaderHighlight, ReaderSettings } from "./ReaderChapterClient.helpers";
