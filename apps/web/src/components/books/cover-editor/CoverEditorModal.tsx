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

type Tab = "text" | "filters";

type CoverEditorModalProps = {
  imageUrl: string;
  bookTitle: string;
  authorName: string;
  onSave: (file: File) => Promise<void>;
  onClose: () => void;
};

export default function CoverEditorModal({
  imageUrl,
  bookTitle,
  authorName,
  onSave,
  onClose,
}: CoverEditorModalProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [tab, setTab] = useState<Tab>("text");
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const editor = useCoverEditor();
  const initRef = useRef(false);

  // Load fonts on mount, then auto-add title/author layers (guard against StrictMode double-fire)
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    loadAllFonts().then(() => {
      setFontsLoaded(true);
      if (bookTitle) {
        editor.addTextLayer({ text: bookTitle, fontSize: 48, fontStyle: "bold", y: 420 });
      }
      if (authorName) {
        editor.addTextLayer({ text: authorName, fontSize: 22, fontStyle: "normal", y: 530 });
      }
    });
    // Only run once on mount
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

    // Deselect so transformer handles aren't rendered
    editor.setSelectedLayerId(null);

    // Wait a frame for Konva to re-render without transformer
    await new Promise((r) => requestAnimationFrame(r));

    try {
      // Export at 2x for high resolution
      const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });

      // Apply CSS filters via offscreen canvas (Konva doesn't apply CSS filters to exports)
      const cssFilter = filtersToCss(editor.filters);
      const needsFilter = cssFilter !== "brightness(1) contrast(1) saturate(1)";

      let finalBlob: Blob;
      if (needsFilter) {
        const img = new window.Image();
        img.src = dataUrl;
        await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; });

        const canvas = document.createElement("canvas");
        canvas.width = CANVAS_WIDTH * 2;
        canvas.height = CANVAS_HEIGHT * 2;
        const ctx = canvas.getContext("2d")!;
        ctx.filter = cssFilter;
        ctx.drawImage(img, 0, 0);
        finalBlob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png")
        );
      } else {
        const res = await fetch(dataUrl);
        finalBlob = await res.blob();
      }

      const file = new File([finalBlob], "cover-edited.png", { type: "image/png" });
      await onSave(file);
    } finally {
      setSaving(false);
      editor.setExporting(false);
    }
  }, [editor, onSave]);

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-slate-50 dark:bg-[#0b0b12]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-[#111318]">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#907AFF]/10">
            <ImageIcon className="h-4 w-4 text-[#907AFF]" />
          </div>
          <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">
            Cover Editor
          </h2>
          {!fontsLoaded && (
            <span className="text-[12px] text-slate-400 dark:text-white/30">Loading fonts...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={editor.undo} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white/60" title="Undo (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={editor.redo} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white/60" title="Redo (Ctrl+Y)">
            <Redo2 className="h-4 w-4" />
          </button>
          <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/10" />
          <button
            type="button"
            onClick={handleExport}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#907AFF] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#8069EE] active:scale-[0.97] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {saving ? "Saving..." : "Save cover"}
          </button>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white/60">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex min-h-0 flex-1">
        {/* Canvas area */}
        <div className="flex flex-1 items-center justify-center bg-slate-100/50 p-8 dark:bg-[#0b0b12]">
          <CoverEditorCanvas
            imageUrl={imageUrl}
            textLayers={editor.textLayers}
            selectedLayerId={editor.selectedLayerId}
            filters={editor.filters}
            onSelectLayer={editor.setSelectedLayerId}
            onUpdateLayer={editor.updateTextLayer}
            stageRef={stageRef}
          />
        </div>

        {/* Right sidebar */}
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-slate-200 bg-white dark:border-white/[0.06] dark:bg-[#111318]">
          {/* Tabs */}
          <div className="flex border-b border-slate-100 dark:border-white/[0.06]">
            {(["text", "filters"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-center text-[13px] font-semibold transition ${
                  tab === t
                    ? "border-b-2 border-[#907AFF] text-[#907AFF]"
                    : "text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
                }`}
              >
                {t === "text" ? "Text" : "Filters"}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "text" ? (
              <CoverEditorTextPanel
                textLayers={editor.textLayers}
                selectedLayer={editor.selectedLayer}
                onAddLayer={editor.addTextLayer}
                onUpdateLayer={editor.updateTextLayer}
                onRemoveLayer={editor.removeTextLayer}
                onSelectLayer={editor.setSelectedLayerId}
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
