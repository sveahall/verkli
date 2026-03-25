"use client";

import {
  COLOR_META,
  COLOR_ORDER,
  type HighlightColor,
  type SelectionState,
} from "../ReaderChapterClient.helpers";

type ReaderHighlightComposerProps = {
  selectionState: SelectionState;
  selectedColor: HighlightColor;
  newNote: string;
  creatingHighlight: boolean;
  canCreateHighlights: boolean;
  onColorChange: (color: HighlightColor) => void;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export default function ReaderHighlightComposer({
  selectionState,
  selectedColor,
  newNote,
  creatingHighlight,
  canCreateHighlights,
  onColorChange,
  onNoteChange,
  onCancel,
  onSave,
}: ReaderHighlightComposerProps) {
  return (
    <div
      className={`fixed z-[120] w-[300px] rounded-2xl border border-black/10 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-slate-900 ${
        selectionState.placement === "top"
          ? "-translate-x-1/2 -translate-y-full"
          : "-translate-x-1/2"
      }`}
      style={{ left: selectionState.x, top: selectionState.y }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <p className="line-clamp-2 text-[12px] text-slate-600 dark:text-white/60">
        “{selectionState.snippet}”
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {COLOR_ORDER.map((color) => {
          const active = color === selectedColor;
          return (
            <button
              key={color}
              type="button"
              onClick={() => onColorChange(color)}
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                active
                  ? "border-[#907AFF]/50 bg-[#907AFF]/10 text-slate-900 dark:text-white"
                  : "border-black/10 text-slate-600 hover:border-black/20 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: COLOR_META[color].swatch }}
              />
              {COLOR_META[color].label}
            </button>
          );
        })}
      </div>

      <textarea
        value={newNote}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder="Optional note"
        className="mt-3 min-h-[72px] w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/15 dark:bg-white/[0.03] dark:text-white/80"
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-black/10 px-3 py-1 text-[12px] font-medium text-slate-700 transition hover:border-black/20 hover:text-slate-900 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={creatingHighlight || !canCreateHighlights}
          onClick={onSave}
          className="rounded-full bg-[#907AFF] px-4 py-1 text-[12px] font-semibold text-white transition hover:bg-[#8069EE] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creatingHighlight ? "Saving..." : "Save highlight"}
        </button>
      </div>
    </div>
  );
}
