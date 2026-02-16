"use client";

import * as React from "react";

type HighlightColor = "yellow" | "green" | "blue" | "rose" | "purple";

const COLORS: { value: HighlightColor; label: string; swatch: string }[] = [
  { value: "yellow", label: "Yellow", swatch: "#facc15" },
  { value: "green", label: "Green", swatch: "#86efac" },
  { value: "blue", label: "Blue", swatch: "#93c5fd" },
  { value: "rose", label: "Rose", swatch: "#fda4af" },
  { value: "purple", label: "Purple", swatch: "#c084fc" },
];

type Props = {
  snippet: string;
  position: { x: number; y: number; placement: "top" | "bottom" };
  onSave: (color: HighlightColor, note: string | null) => void;
  onCancel: () => void;
  saving?: boolean;
};

export default function HighlightPopover({ snippet, position, onSave, onCancel, saving }: Props) {
  const [color, setColor] = React.useState<HighlightColor>("yellow");
  const [note, setNote] = React.useState("");

  return (
    <div
      className={`fixed z-[120] w-[300px] rounded-2xl border border-black/10 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-slate-900 ${
        position.placement === "top" ? "-translate-x-1/2 -translate-y-full" : "-translate-x-1/2"
      }`}
      style={{ left: position.x, top: position.y }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <p className="line-clamp-2 text-[12px] text-slate-600 dark:text-white/60">
        &ldquo;{snippet}&rdquo;
      </p>

      <div className="mt-3 flex items-center gap-2">
        {COLORS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setColor(item.value)}
            className={`h-7 w-7 rounded-full border-2 transition ${
              color === item.value
                ? "border-[#907AFF] ring-2 ring-[#907AFF]/30"
                : "border-transparent hover:border-black/20 dark:hover:border-white/20"
            }`}
            style={{ backgroundColor: item.swatch }}
            aria-label={item.label}
            title={item.label}
          />
        ))}
      </div>

      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional note..."
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
          disabled={saving}
          onClick={() => onSave(color, note.trim() || null)}
          className="rounded-full bg-[#907AFF] px-4 py-1 text-[12px] font-semibold text-white transition hover:bg-[#8069EE] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

export type { HighlightColor };
