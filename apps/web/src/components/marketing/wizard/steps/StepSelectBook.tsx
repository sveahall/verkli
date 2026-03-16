"use client";

import Image from "next/image";
import { useTrailerWizard } from "@/components/marketing/wizard/WizardContext";
import {
  GENRE_OPTIONS,
  TONE_LABELS,
} from "@/components/marketing/wizard/wizard-machine";

export default function StepSelectBook() {
  const { state, selectBook, canGoNext, goNext } = useTrailerWizard();
  const selectedBook = state.books.find((b) => b.id === state.selectedBookId);
  const noCover = selectedBook && !selectedBook.cover_image;

  const genreLabel = state.feeling.genre
    ? GENRE_OPTIONS.find((g) => g.value === state.feeling.genre)?.label
    : null;
  const toneLabel = state.feeling.tone
    ? TONE_LABELS[state.feeling.tone]
    : null;

  return (
    <section className="space-y-4">
      <div className="card-base p-6">
        <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
          Välj bok
        </h2>
        <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/50">
          Välj boken du vill skapa en trailer för.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.books.map((book) => {
            const isSelected = book.id === state.selectedBookId;
            const hasCover = Boolean(book.cover_image);

            return (
              <button
                key={book.id}
                type="button"
                onClick={() => selectBook(book.id)}
                className={`group relative overflow-hidden rounded-xl border text-left transition ${
                  isSelected
                    ? "border-slate-900 ring-2 ring-slate-900 dark:border-white dark:ring-white"
                    : "border-slate-200 hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:hover:border-white/20"
                } ${!hasCover ? "opacity-70" : ""}`}
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-100 dark:bg-white/5">
                  {book.cover_image ? (
                    <Image
                      src={book.cover_image}
                      alt={book.title ?? "Bok"}
                      fill
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1.5">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        className="text-slate-300 dark:text-white/20"
                      >
                        <rect
                          x="3"
                          y="3"
                          width="18"
                          height="18"
                          rx="2"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx="8.5"
                          cy="8.5"
                          r="1.5"
                          fill="currentColor"
                        />
                        <path
                          d="M21 15l-5-5L5 21"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="text-[11px] text-slate-400 dark:text-white/30">
                        Inget omslag
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                    {book.title ?? "Namnlös bok"}
                  </p>
                </div>
                {isSelected && (
                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M2.5 6L5 8.5L9.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Cover warning */}
        {noCover && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-950/20">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="shrink-0 text-amber-500"
            >
              <path
                d="M8 5.5v3M8 11h.01"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            <p className="text-[12px] text-amber-700 dark:text-amber-300">
              Tips: Lägg till ett omslag för bättre trailerresultat.
            </p>
          </div>
        )}
      </div>

      {/* Auto-detected preview */}
      {selectedBook && genreLabel && (
        <div className="card-base flex items-center gap-3 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className="text-emerald-500"
            >
              <path
                d="M22 11.08V12a10 10 0 11-5.93-9.14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M22 4L12 14.01l-3-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-slate-700 dark:text-white/80">
              Automatiskt identifierad som{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                {genreLabel}
              </span>
              {toneLabel && (
                <>
                  {" "}
                  med{" "}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {toneLabel.toLowerCase()}
                  </span>{" "}
                  ton
                </>
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-white/30">
              Du kan justera detta i nästa steg.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          Fortsätt
        </button>
      </div>
    </section>
  );
}
