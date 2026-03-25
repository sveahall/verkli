"use client";

import { COLOR_META, type ReaderHighlight, type ReaderThemeOption } from "../ReaderChapterClient.helpers";

type ReaderHighlightsPanelProps = {
  currentTheme: ReaderThemeOption;
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
  currentTheme,
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
    <section
      className="rounded-[24px] border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)]"
      style={{
        background: currentTheme.panelBg,
        borderColor: currentTheme.panelBorder,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Highlights
          </h3>
          <span className="text-[12px] text-slate-500 dark:text-white/50">
            {highlightCountLabel}
          </span>
        </div>
        <span className="text-[12px] font-medium text-slate-600 dark:text-white/60">
          {showHighlightsPanel ? "Hide" : "Show"}
        </span>
      </button>

      {chapterMessage && (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-200">
          {chapterMessage}
        </p>
      )}

      {showHighlightsPanel && (
        <>
          {highlights.length === 0 ? (
            <p className="mt-4 text-[13px] text-slate-600 dark:text-white/60">
              Select text in this chapter to add your first highlight.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {highlights.map((highlight) => {
                const colorMeta = COLOR_META[highlight.color];
                return (
                  <article
                    key={highlight.id}
                    className="rounded-xl border border-slate-200 bg-white/85 p-3 dark:border-white/10 dark:bg-white/[0.04]"
                  >
                    <button
                      type="button"
                      onClick={() => onScrollToHighlight(highlight)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-white/50">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: colorMeta.swatch }}
                        />
                        {colorMeta.label}
                      </div>
                      <p className="mt-2 text-[13px] leading-relaxed text-slate-800 dark:text-white/80">
                        “{highlight.snippet}”
                      </p>
                    </button>

                    <textarea
                      value={noteDrafts[highlight.id] ?? ""}
                      onChange={(event) =>
                        onNoteDraftChange(highlight.id, event.target.value)
                      }
                      placeholder="Add a note"
                      className="mt-3 min-h-[76px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none transition focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80"
                    />

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSaveNote(highlight.id)}
                        disabled={savingNoteId === highlight.id || !userId}
                        className="rounded-full border border-slate-200 px-3 py-1 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                      >
                        {savingNoteId === highlight.id ? "Saving..." : "Save note"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteHighlight(highlight.id)}
                        disabled={deletingId === highlight.id || !userId}
                        className="rounded-full border border-red-200 px-3 py-1 text-[12px] font-medium text-red-600 transition hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/40 dark:text-red-300"
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
