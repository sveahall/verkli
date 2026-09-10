"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Undo2, Redo2, X, Download } from "lucide-react";
import type Konva from "konva";
import CoverEditorCanvas, { CANVAS_WIDTH, CANVAS_HEIGHT } from "./CoverEditorCanvas";
import CoverEditorTextPanel from "./CoverEditorTextPanel";
import CoverEditorFilterPanel from "./CoverEditorFilterPanel";
import { useCoverEditor } from "./useCoverEditor";
import { loadAllFonts } from "./cover-editor.fonts";
import { filtersToCss } from "./cover-editor.filters";
import { saveCoverEditorState, loadCoverEditorState } from "./cover-editor.storage";

type Tab = "text" | "filters";

type CoverEditorModalProps = {
  imageUrl: string;
  bookId: string;
  bookTitle: string;
  authorName: string;
  onSave: (file: File) => Promise<void>;
  onClose: () => void;
};

export default function CoverEditorModal({
  imageUrl,
  bookId,
  bookTitle,
  authorName,
  onSave,
  onClose,
}: CoverEditorModalProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [tab, setTab] = useState<Tab>("text");
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState(imageUrl);

  const editor = useCoverEditor();
  const initRef = useRef(false);

  // On mount: load fonts, then restore saved editor state if available
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    loadAllFonts().then(() => {
      setFontsLoaded(true);
      const saved = loadCoverEditorState(bookId);
      if (saved && saved.textLayers.length > 0) {
        setBackgroundUrl(saved.backgroundUrl);
        for (const layer of saved.textLayers) {
          editor.addTextLayer(layer);
        }
        if (saved.filters.brightness || saved.filters.contrast || saved.filters.saturation) {
          editor.applyFilterPreset(saved.filters);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); editor.undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); editor.redo(); }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (editor.selectedLayerId && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          e.preventDefault();
          editor.removeTextLayer(editor.selectedLayerId);
        }
      }
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [editor, onClose]);

  const handleExport = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return;

    setSaving(true);
    editor.setExporting(true);
    editor.setSelectedLayerId(null);

    await new Promise((r) => requestAnimationFrame(r));

    try {
      const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
      const cssFilter = filtersToCss(editor.filters);
      const needsFilter = cssFilter !== "brightness(1) contrast(1) saturate(1)";

      // Convert data URL to image for canvas operations
      const img = new window.Image();
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; });

      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_WIDTH * 2;
      canvas.height = CANVAS_HEIGHT * 2;
      const ctx = canvas.getContext("2d")!;
      if (needsFilter) ctx.filter = cssFilter;
      ctx.drawImage(img, 0, 0);

      const finalBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png")
      );

      // Persist editor state so layers can be restored on next edit
      saveCoverEditorState(bookId, backgroundUrl, editor.textLayers, editor.filters);

      const file = new File([finalBlob], "cover-edited.png", { type: "image/png" });
      await onSave(file);
    } finally {
      setSaving(false);
      editor.setExporting(false);
    }
  }, [editor, onSave, bookId, backgroundUrl]);

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-background dark:bg-card">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 dark:border-border dark:bg-card">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#907AFF]/10">
            <ImageIcon className="h-4 w-4 text-accent-foreground" />
          </div>
          <h2 className="text-[15px] font-semibold text-foreground dark:text-foreground">Cover Editor</h2>
          {!fontsLoaded && <span className="text-[12px] text-muted-foreground">Loading fonts...</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={editor.undo} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-muted-foreground dark:text-muted-foreground dark:hover:bg-accent" title="Undo (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={editor.redo} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-muted-foreground dark:text-muted-foreground dark:hover:bg-accent" title="Redo (Ctrl+Y)">
            <Redo2 className="h-4 w-4" />
          </button>
          <div className="mx-1 h-5 w-px bg-muted dark:bg-card" />
          <button type="button" onClick={handleExport} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50">
            <Download className="h-4 w-4" />
            {saving ? "Saving..." : "Save cover"}
          </button>
          <button type="button" onClick={onClose} aria-label="Close cover editor" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-muted-foreground dark:text-muted-foreground dark:hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="flex min-h-[360px] min-w-0 flex-1 items-start justify-start overflow-auto bg-muted/50 p-4 lg:items-center lg:justify-center lg:p-8 dark:bg-card">
          <CoverEditorCanvas
            imageUrl={backgroundUrl}
            textLayers={editor.textLayers}
            selectedLayerId={editor.selectedLayerId}
            filters={editor.filters}
            onSelectLayer={editor.setSelectedLayerId}
            onUpdateLayer={editor.updateTextLayer}
            stageRef={stageRef}
          />
        </div>

        <aside className="flex max-h-[45vh] w-full shrink-0 flex-col border-t lg:max-h-none lg:w-[320px] lg:border-l lg:border-t-0 border-border bg-card dark:border-border dark:bg-card">
          <div className="flex border-b border-border dark:border-border">
            {(["text", "filters"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 py-3 text-center text-[13px] font-semibold transition ${tab === t ? "border-b-2 border-[#907AFF] text-accent-foreground" : "text-muted-foreground hover:text-muted-foreground dark:text-muted-foreground"}`}>
                {t === "text" ? "Text" : "Filters"}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "text" ? (
              <CoverEditorTextPanel
                textLayers={editor.textLayers}
                selectedLayer={editor.selectedLayer}
                onAddLayer={editor.addTextLayer}
                onUpdateLayer={editor.updateTextLayer}
                onRemoveLayer={editor.removeTextLayer}
                onSelectLayer={editor.setSelectedLayerId}
                bookTitle={bookTitle}
                authorName={authorName}
              />
            ) : (
              <CoverEditorFilterPanel
                filters={editor.filters}
                onUpdateFilters={editor.updateFilters}
                onApplyPreset={editor.applyFilterPreset}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
