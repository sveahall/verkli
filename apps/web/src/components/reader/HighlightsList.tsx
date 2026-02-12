"use client";

import { useState } from "react";
import type { Highlight } from "@/hooks/useHighlights";

const COLOR_SWATCHES: Record<string, string> = {
  yellow: "#facc15",
  green: "#86efac",
  blue: "#93c5fd",
  rose: "#fda4af",
  purple: "#c084fc",
};

type Props = {
  highlights: Highlight[];
  onScrollTo?: (highlight: Highlight) => void;
  onDelete?: (id: string) => Promise<boolean>;
};

export default function HighlightsList({ highlights, onScrollTo, onDelete }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!onDelete) return;
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  };

  if (highlights.length === 0) {
    return (
      <p className="text-[13px] text-slate-600 dark:text-white/60">
        Markera text i kapitlet f\u00f6r att skapa din f\u00f6rsta markering.
      </p>
    );
  }

  const countLabel = highlights.length === 1 ? "1 markering" : `${highlights.length} markeringar`;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Markeringar</h3>
        <span className="text-[12px] text-slate-500 dark:text-white/50">{countLabel}</span>
      </div>

      <div className="space-y-3">
        {highlights.map((hl) => {
          const swatch = COLOR_SWATCHES[hl.color] ?? COLOR_SWATCHES.yellow;

          return (
            <article
              key={hl.id}
              className="rounded-xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <button
                type="button"
                onClick={() => onScrollTo?.(hl)}
                className="w-full text-left"
              >
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-white/50">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: swatch }}
                  />
                  {hl.color}
                </div>
                <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-slate-800 dark:text-white/80">
                  &ldquo;{hl.snippet}&rdquo;
                </p>
              </button>

              {hl.note && (
                <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-600 dark:bg-white/5 dark:text-white/60">
                  {hl.note}
                </p>
              )}

              {onDelete && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleDelete(hl.id)}
                    disabled={deletingId === hl.id}
                    className="rounded-full border border-red-200 px-3 py-1 text-[12px] font-medium text-red-600 transition hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/40 dark:text-red-300"
                  >
                    {deletingId === hl.id ? "Tar bort\u2026" : "Ta bort"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
