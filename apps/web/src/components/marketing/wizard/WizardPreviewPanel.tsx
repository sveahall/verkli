"use client";

import { useTrailerWizard } from "@/components/marketing/wizard/WizardContext";
import { TONE_LABELS, TONE_MOOD_FILTERS } from "@/components/marketing/wizard/wizard-machine";

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export default function WizardPreviewPanel() {
  const { state, selectedBook } = useTrailerWizard();
  const coverUrl = selectedBook?.cover_image ?? null;
  const toneFilter =
    state.feeling.tone ? TONE_MOOD_FILTERS[state.feeling.tone] : undefined;

  return (
    <aside
      aria-label="Förhandsvisning"
      className="space-y-4 lg:sticky lg:top-6 lg:self-start"
    >
      {/* Book cover */}
      <div className="card-base overflow-hidden">
        <div className="aspect-[2/3] w-full bg-slate-100 dark:bg-white/5">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={selectedBook?.title ?? "Bok"}
              className="h-full w-full object-cover transition-[filter] duration-500"
              style={toneFilter ? { filter: toneFilter } : undefined}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                className="text-slate-300 dark:text-white/20"
              >
                <path
                  d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[12px] text-slate-400 dark:text-white/30">
                Ingen omslagsbild
              </span>
            </div>
          )}
        </div>

        {/* Tone badge overlay */}
        {state.feeling.tone && (
          <div className="border-t border-slate-200/80 px-3 py-2 dark:border-white/10">
            <p className="text-[11px] font-medium text-slate-500 dark:text-white/50">
              Stämning: {TONE_LABELS[state.feeling.tone]}
            </p>
          </div>
        )}
      </div>

      {/* Book info */}
      <div className="card-base p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-white/40">
          Bok
        </h3>
        <p className="mt-2 text-[14px] font-semibold text-slate-900 dark:text-white">
          {selectedBook?.title?.trim() || "Ingen bok vald"}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500 dark:text-white/50">
          {selectedBook?.description
            ? truncate(selectedBook.description, 220)
            : "Välj en bok för att starta trailerflödet."}
        </p>
      </div>

      {/* Output preview */}
      <div className="card-base p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-white/40">
          Resultat
        </h3>

        {state.generate.status === "loading" && (
          <div className="mt-3 space-y-2">
            <div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-white/5" />
            <div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-white/5" />
          </div>
        )}

        {state.generate.status === "error" && state.generate.errorMessage && (
          <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-500/40 dark:bg-red-950/20 dark:text-red-300">
            {state.generate.errorMessage}
          </p>
        )}

        {state.generate.scenes.length > 0 ? (
          <div className="mt-3 space-y-2">
            {state.generate.scenes.slice(0, 2).map((scene, index) => (
              <article
                key={`${index}-${scene.visual_prompt}`}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80"
              >
                <p className="font-semibold">Scen {index + 1}</p>
                <p className="mt-1 leading-relaxed">
                  {truncate(scene.visual_prompt, 160)}
                </p>
              </article>
            ))}

            {state.generate.scenes.length > 2 && (
              <p className="text-center text-[11px] text-slate-400 dark:text-white/30">
                +{state.generate.scenes.length - 2} till
              </p>
            )}

            {state.generate.caption.trim().length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80">
                <p className="font-semibold">Bildtext</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                  {truncate(state.generate.caption, 220)}
                </p>
              </div>
            )}
          </div>
        ) : (
          state.generate.status !== "loading" && (
            <p className="mt-2 text-[12px] text-slate-400 dark:text-white/30">
              Scener visas här efter generering.
            </p>
          )
        )}

        {state.build.status === "building" && (
          <div className="mt-3 flex items-center gap-2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600 dark:border-white/10 dark:border-t-white/60" />
            <p className="text-[12px] text-slate-600 dark:text-white/70">
              Bygger trailer...
            </p>
          </div>
        )}

        {state.build.status === "completed" && (
          <div className="mt-3 flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="text-emerald-500"
            >
              <path
                d="M3 7L6 10L11 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
              Trailern är klar!
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
