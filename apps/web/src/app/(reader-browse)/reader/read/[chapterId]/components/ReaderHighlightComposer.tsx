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
      className={`fixed z-[120] w-[280px] rounded-xl border border-black/[0.06] bg-white p-4 shadow-md dark:border-white/10 dark:bg-[#1a1d24] ${
        selectionState.placement === "top"
          ? "-translate-x-1/2 -translate-y-full"
          : "-translate-x-1/2"
      }`}
      style={{ left: selectionState.x, top: selectionState.y }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <p className="line-clamp-2 text-xs text-[#64748B] dark:text-white/60">
        &quot;{selectionState.snippet}&quot;
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {COLOR_ORDER.map((color) => {
          const active = color === selectedColor;
          return (
            <button
              key={color}
              type="button"
              onClick={() => onColorChange(color)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-[#907AFF]/30 bg-[#907AFF]/10 text-[#0F172A] dark:text-white"
                  : "border-black/[0.06] text-[#64748B] hover:bg-black/[0.02] dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
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
        className="mt-2 min-h-[64px] w-full rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-xs text-[#0F172A] outline-none transition focus:border-[#907AFF]/40 focus:ring-2 focus:ring-[#907AFF]/15 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80"
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-black/[0.06] px-3 py-1 text-xs font-medium text-[#64748B] transition-colors hover:bg-black/[0.02] hover:text-[#0F172A] dark:border-white/10 dark:text-white/60 dark:hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={creatingHighlight || !canCreateHighlights}
          onClick={onSave}
          className="rounded-xl bg-[#907AFF] px-4 py-1 text-xs font-semibold text-white transition-all duration-200 hover:bg-[#7A66E0] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
        >
          {creatingHighlight ? "Saving..." : "Save highlight"}
        </button>
      </div>
    </div>
  );
}
