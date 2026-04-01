"use client";

import { Plus, Trash2, Type } from "lucide-react";
import { COVER_EDITOR_FONTS } from "./cover-editor.fonts";
import type { CoverTextLayer } from "./cover-editor.types";

const COLOR_PRESETS = [
  "#FFFFFF", "#000000", "#907AFF", "#E29ED5", "#FCC997",
  "#1E293B", "#DC2626", "#059669", "#2563EB", "#D97706",
];

type CoverEditorTextPanelProps = {
  textLayers: CoverTextLayer[];
  selectedLayer: CoverTextLayer | null;
  onAddLayer: (defaults?: Partial<CoverTextLayer>) => void;
  onUpdateLayer: (id: string, patch: Partial<CoverTextLayer>) => void;
  onRemoveLayer: (id: string) => void;
  onSelectLayer: (id: string | null) => void;
};

export default function CoverEditorTextPanel({
  textLayers,
  selectedLayer,
  onAddLayer,
  onUpdateLayer,
  onRemoveLayer,
  onSelectLayer,
}: CoverEditorTextPanelProps) {
  return (
    <div className="space-y-5">
      {/* Quick-add buttons */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">
          Add text
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onAddLayer({ text: "Book Title", fontSize: 48, fontStyle: "bold" })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:border-[#907AFF]/40 hover:text-[#907AFF] dark:border-white/10 dark:text-white/60 dark:hover:border-[#907AFF]/40">
            <Plus className="h-3.5 w-3.5" /> Title
          </button>
          <button type="button" onClick={() => onAddLayer({ text: "Author Name", fontSize: 24, fontStyle: "normal" })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:border-[#907AFF]/40 hover:text-[#907AFF] dark:border-white/10 dark:text-white/60 dark:hover:border-[#907AFF]/40">
            <Plus className="h-3.5 w-3.5" /> Author
          </button>
          <button type="button" onClick={() => onAddLayer({ text: "Subtitle", fontSize: 18, fontStyle: "normal" })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:border-[#907AFF]/40 hover:text-[#907AFF] dark:border-white/10 dark:text-white/60 dark:hover:border-[#907AFF]/40">
            <Plus className="h-3.5 w-3.5" /> Subtitle
          </button>
        </div>
      </div>

      {/* Layer list */}
      {textLayers.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">
            Layers
          </p>
          <div className="space-y-1">
            {textLayers.map((layer) => (
              <button
                key={layer.id}
                type="button"
                onClick={() => onSelectLayer(layer.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
                  layer.id === selectedLayer?.id
                    ? "bg-[#907AFF]/10 text-[#907AFF] font-medium"
                    : "text-slate-600 hover:bg-slate-50 dark:text-white/60 dark:hover:bg-white/5"
                }`}
              >
                <Type className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate">{layer.text || "Empty"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected layer controls */}
      {selectedLayer && (
        <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-white/[0.06]">
          {/* Text input */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">
              Text
            </label>
            <input
              type="text"
              value={selectedLayer.text}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { text: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </div>

          {/* Font family */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">
              Font
            </label>
            <select
              value={selectedLayer.fontFamily}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { fontFamily: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none focus:border-[#907AFF]/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              {COVER_EDITOR_FONTS.map((f) => (
                <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Font size */}
          <div>
            <label className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">
              Size <span className="tabular-nums">{selectedLayer.fontSize}px</span>
            </label>
            <input
              type="range" min={8} max={120} step={1}
              value={selectedLayer.fontSize}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { fontSize: Number(e.target.value) })}
              className="w-full accent-[#907AFF]"
            />
          </div>

          {/* Style toggles */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const isBold = selectedLayer.fontStyle.includes("bold");
                const isItalic = selectedLayer.fontStyle.includes("italic");
                const next = !isBold
                  ? isItalic ? "bold italic" : "bold"
                  : isItalic ? "italic" : "normal";
                onUpdateLayer(selectedLayer.id, { fontStyle: next as CoverTextLayer["fontStyle"] });
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[14px] font-bold transition ${
                selectedLayer.fontStyle.includes("bold")
                  ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#907AFF]"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-white/10 dark:text-white/40"
              }`}
            >B</button>
            <button
              type="button"
              onClick={() => {
                const isBold = selectedLayer.fontStyle.includes("bold");
                const isItalic = selectedLayer.fontStyle.includes("italic");
                const next = !isItalic
                  ? isBold ? "bold italic" : "italic"
                  : isBold ? "bold" : "normal";
                onUpdateLayer(selectedLayer.id, { fontStyle: next as CoverTextLayer["fontStyle"] });
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[14px] italic transition ${
                selectedLayer.fontStyle.includes("italic")
                  ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#907AFF]"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-white/10 dark:text-white/40"
              }`}
            >I</button>

            {/* Alignment */}
            {(["left", "center", "right"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => onUpdateLayer(selectedLayer.id, { align: a })}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[11px] transition ${
                  selectedLayer.align === a
                    ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#907AFF]"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-white/10 dark:text-white/40"
                }`}
              >
                {a === "left" ? (
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="1.5" rx=".5" /><rect x="2" y="7" width="8" height="1.5" rx=".5" /><rect x="2" y="11" width="10" height="1.5" rx=".5" /></svg>
                ) : a === "center" ? (
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="1.5" rx=".5" /><rect x="4" y="7" width="8" height="1.5" rx=".5" /><rect x="3" y="11" width="10" height="1.5" rx=".5" /></svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="1.5" rx=".5" /><rect x="6" y="7" width="8" height="1.5" rx=".5" /><rect x="4" y="11" width="10" height="1.5" rx=".5" /></svg>
                )}
              </button>
            ))}
          </div>

          {/* Color */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">
              Color
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onUpdateLayer(selectedLayer.id, { fill: c })}
                  className={`h-7 w-7 rounded-lg border-2 transition ${
                    selectedLayer.fill === c ? "border-[#907AFF] scale-110" : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Delete layer */}
          <button
            type="button"
            onClick={() => onRemoveLayer(selectedLayer.id)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove layer
          </button>
        </div>
      )}
    </div>
  );
}
