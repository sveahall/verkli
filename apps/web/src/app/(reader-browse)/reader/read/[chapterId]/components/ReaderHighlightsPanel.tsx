"use client";

import { COLOR_META, type ReaderHighlight } from "../ReaderChapterClient.helpers";

type ReaderHighlightsPanelProps = {
  highlightCountLabel: string;
  showHighlightsPanel: boolean;
  chapterMessage: string | null;
  highlights: ReaderHighlight[];
  noteDrafts: Record<string, string>;
  savingNoteId: string | null;
  deletingId: string | null;
  userId: string | null;
  onToggle: () => void;
  onNoteDraftChange: (highlightId: string, value: string) => void;
  onSaveNote: (highlightId: string) => void;
  onDeleteHighlight: (highlightId: string) => void;
  onScrollToHighlight: (highlight: ReaderHighlight) => void;
};

export default function ReaderHighlightsPanel({
  highlightCountLabel,
  showHighlightsPanel,
  chapterMessage,
  highlights,
  noteDrafts,
  savingNoteId,
  deletingId,
  userId,
  onToggle,
  onNoteDraftChange,
  onSaveNote,
  onDeleteHighlight,
  onScrollToHighlight,
}: ReaderHighlightsPanelProps) {
  return (
    <section className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[#0F172A] dark:text-white">
            Highlights
          </h3>
          <span className="text-xs text-[#64748B] dark:text-white/50">
            {highlightCountLabel}
          </span>
        </div>
        <span className="text-xs font-medium text-[#907AFF]">
          {showHighlightsPanel ? "Hide" : "Show"}
        </span>
      </button>

      {chapterMessage && (
        <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
          {chapterMessage}
        </p>
      )}

      {showHighlightsPanel && (
        <>
          {highlights.length === 0 ? (
            <p className="mt-4 text-sm text-[#64748B] dark:text-white/60">
              Select text in this chapter to add your first highlight.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {highlights.map((highlight) => {
                const colorMeta = COLOR_META[highlight.color];
                return (
                  <article
                    key={highlight.id}
                    className="rounded-xl border border-black/[0.06] bg-[#F8F9FB] p-3 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <button
                      type="button"
                      onClick={() => onScrollToHighlight(highlight)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-white/50">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: colorMeta.swatch }}
                        />
                        {colorMeta.label}
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#0F172A] dark:text-white/80">
                        &quot;{highlight.snippet}&quot;
                      </p>
                    </button>

                    <textarea
                      value={noteDrafts[highlight.id] ?? ""}
                      onChange={(event) =>
                        onNoteDraftChange(highlight.id, event.target.value)
                      }
                      placeholder="Add a note"
                      className="mt-2 min-h-[68px] w-full rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-xs text-[#0F172A] outline-none transition focus:border-[#907AFF]/40 focus:ring-2 focus:ring-[#907AFF]/15 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80"
                    />

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSaveNote(highlight.id)}
                        disabled={savingNoteId === highlight.id || !userId}
                        className="rounded-xl border border-black/[0.06] px-3 py-1 text-xs font-medium text-[#0F172A] transition-colors hover:bg-black/[0.03] disabled:pointer-events-none disabled:opacity-40 dark:border-white/10 dark:text-white/70"
                      >
                        {savingNoteId === highlight.id ? "Saving..." : "Save note"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteHighlight(highlight.id)}
                        disabled={deletingId === highlight.id || !userId}
                        className="rounded-xl border border-red-500/20 px-3 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/5 disabled:pointer-events-none disabled:opacity-40"
                      >
                        {deletingId === highlight.id ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
