"use client";

import { AlignCenter, AlignVerticalJustifyCenter, Plus, Trash2, Type } from "lucide-react";
import { COVER_EDITOR_FONTS } from "./cover-editor.fonts";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "./CoverEditorCanvas";
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
  const centerHorizontally = () => {
    if (!selectedLayer) return;
    onUpdateLayer(selectedLayer.id, { x: (CANVAS_WIDTH - selectedLayer.width) / 2 });
  };

  const centerVertically = () => {
    if (!selectedLayer) return;
    // Approximate height from fontSize
    const approxHeight = selectedLayer.fontSize * 1.3;
    onUpdateLayer(selectedLayer.id, { y: (CANVAS_HEIGHT - approxHeight) / 2 });
  };

  return (
    <div className="space-y-5">
      {/* Quick-add buttons */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">
          Add text
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Title", defaults: { text: "Book Title", fontSize: 48, fontStyle: "bold" as const, y: 400, width: 300, x: 50 } },
            { label: "Author", defaults: { text: "Author Name", fontSize: 22, fontStyle: "normal" as const, y: 530, width: 300, x: 50 } },
            { label: "Subtitle", defaults: { text: "Subtitle", fontSize: 16, fontStyle: "normal" as const, y: 470, width: 300, x: 50 } },
          ].map((item) => (
            <button key={item.label} type="button" onClick={() => onAddLayer(item.defaults)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:border-[#907AFF]/40 hover:bg-[#907AFF]/5 hover:text-[#907AFF] active:scale-[0.97] dark:border-white/10 dark:text-white/60">
              <Plus className="h-3.5 w-3.5" /> {item.label}
            </button>
          ))}
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
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] transition ${
                  layer.id === selectedLayer?.id
                    ? "bg-[#907AFF]/10 text-[#907AFF] font-semibold"
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
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">Text</label>
            <input
              type="text"
              value={selectedLayer.text}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { text: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-800 outline-none focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </div>

          {/* Font + size row */}
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <select
              value={selectedLayer.fontFamily}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { fontFamily: e.target.value })}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-700 outline-none focus:border-[#907AFF]/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              {COVER_EDITOR_FONTS.map((f) => (
                <option key={f.family} value={f.family}>{f.label}</option>
              ))}
            </select>
            <input
              type="number"
              min={8}
              max={200}
              value={selectedLayer.fontSize}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { fontSize: Number(e.target.value) || 16 })}
              className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-center text-[13px] text-slate-700 outline-none focus:border-[#907AFF]/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </div>

          {/* Style + alignment + center */}
          <div className="flex items-center gap-1">
            {/* Bold */}
            <button type="button" onClick={() => {
              const isBold = selectedLayer.fontStyle.includes("bold");
              const isItalic = selectedLayer.fontStyle.includes("italic");
              const next = !isBold ? (isItalic ? "bold italic" : "bold") : (isItalic ? "italic" : "normal");
              onUpdateLayer(selectedLayer.id, { fontStyle: next as CoverTextLayer["fontStyle"] });
            }} className={`flex h-9 w-9 items-center justify-center rounded-xl text-[14px] font-bold transition ${selectedLayer.fontStyle.includes("bold") ? "bg-[#907AFF]/10 text-[#907AFF]" : "text-slate-500 hover:bg-slate-50 dark:text-white/40"}`}>B</button>

            {/* Italic */}
            <button type="button" onClick={() => {
              const isBold = selectedLayer.fontStyle.includes("bold");
              const isItalic = selectedLayer.fontStyle.includes("italic");
              const next = !isItalic ? (isBold ? "bold italic" : "italic") : (isBold ? "bold" : "normal");
              onUpdateLayer(selectedLayer.id, { fontStyle: next as CoverTextLayer["fontStyle"] });
            }} className={`flex h-9 w-9 items-center justify-center rounded-xl text-[14px] italic transition ${selectedLayer.fontStyle.includes("italic") ? "bg-[#907AFF]/10 text-[#907AFF]" : "text-slate-500 hover:bg-slate-50 dark:text-white/40"}`}>I</button>

            <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/10" />

            {/* Align left/center/right */}
            {(["left", "center", "right"] as const).map((a) => (
              <button key={a} type="button" onClick={() => onUpdateLayer(selectedLayer.id, { align: a })} className={`flex h-9 w-9 items-center justify-center rounded-xl text-[11px] transition ${selectedLayer.align === a ? "bg-[#907AFF]/10 text-[#907AFF]" : "text-slate-500 hover:bg-slate-50 dark:text-white/40"}`}>
                {a === "left" ? "L" : a === "center" ? "C" : "R"}
              </button>
            ))}

            <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/10" />

            {/* Center H / V */}
            <button type="button" onClick={centerHorizontally} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#907AFF]/10 hover:text-[#907AFF] dark:text-white/40" title="Center horizontally">
              <AlignCenter className="h-4 w-4" />
            </button>
            <button type="button" onClick={centerVertically} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#907AFF]/10 hover:text-[#907AFF] dark:text-white/40" title="Center vertically">
              <AlignVerticalJustifyCenter className="h-4 w-4" />
            </button>
          </div>

          {/* Color */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c} type="button"
                  onClick={() => onUpdateLayer(selectedLayer.id, { fill: c })}
                  className={`h-8 w-8 rounded-xl border-2 transition hover:scale-110 ${selectedLayer.fill === c ? "border-[#907AFF] ring-2 ring-[#907AFF]/20" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Shadow */}
          <div>
            <label className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">
              Shadow <span className="tabular-nums normal-case">{selectedLayer.shadowBlur}px</span>
            </label>
            <input
              type="range" min={0} max={30} step={1}
              value={selectedLayer.shadowBlur}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { shadowBlur: Number(e.target.value) })}
              className="w-full accent-[#907AFF]"
            />
          </div>

          {/* Stroke */}
          <div>
            <label className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">
              Outline <span className="tabular-nums normal-case">{selectedLayer.strokeWidth}px</span>
            </label>
            <input
              type="range" min={0} max={8} step={0.5}
              value={selectedLayer.strokeWidth}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { strokeWidth: Number(e.target.value), stroke: selectedLayer.stroke || "#000000" })}
              className="w-full accent-[#907AFF]"
            />
          </div>

          {/* Delete */}
          <button
            type="button"
            onClick={() => onRemoveLayer(selectedLayer.id)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium text-red-500 transition hover:bg-red-50 active:scale-[0.97] dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove layer
          </button>
        </div>
      )}
    </div>
  );
}
