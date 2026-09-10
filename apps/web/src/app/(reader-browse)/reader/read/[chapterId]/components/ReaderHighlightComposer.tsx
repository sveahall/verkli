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
      className={`fixed z-[120] w-[280px] rounded-xl border border-black/[0.06] bg-card p-4 shadow-md dark:border-border dark:bg-card ${
        selectionState.placement === "top"
          ? "-translate-x-1/2 -translate-y-full"
          : "-translate-x-1/2"
      }`}
      style={{ left: selectionState.x, top: selectionState.y }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <p className="line-clamp-2 text-xs text-muted-foreground dark:text-muted-foreground">
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
                  ? "border-[#907AFF]/30 bg-[#907AFF]/10 text-foreground dark:text-foreground"
                  : "border-black/[0.06] text-muted-foreground hover:bg-black/[0.02] dark:border-border dark:text-muted-foreground dark:hover:bg-card"
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
        className="mt-2 min-h-[64px] w-full rounded-xl border border-black/[0.06] bg-card px-3 py-2 text-xs text-foreground outline-none transition focus:border-[#907AFF]/40 focus:ring-2 focus:ring-[#907AFF]/15 dark:border-border dark:bg-card dark:text-foreground"
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-black/[0.06] px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-black/[0.02] hover:text-foreground dark:border-border dark:text-muted-foreground dark:hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={creatingHighlight || !canCreateHighlights}
          onClick={onSave}
          className="min-h-11 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-[background-color,border-color,color,box-shadow] duration-200 hover:bg-primary/90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
        >
          {creatingHighlight ? "Saving..." : "Save highlight"}
        </button>
      </div>
    </div>
  );
}
