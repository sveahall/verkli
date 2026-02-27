"use client";

import { useTrailerWizard } from "@/components/marketing/wizard/WizardContext";

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export default function WizardPreviewPanel() {
  const { state, selectedBook } = useTrailerWizard();
  const coverUrl = selectedBook?.cover_image ?? null;

  return (
    <aside aria-label="Forhandsvisning" className="space-y-4 lg:sticky lg:top-6 lg:self-start">
      <div className="card-base overflow-hidden">
        <div className="aspect-[2/3] w-full bg-slate-100 dark:bg-white/5">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt={selectedBook?.title ?? "Bok"} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-[13px] text-slate-400 dark:text-white/30">Ingen omslagsbild</span>
            </div>
          )}
        </div>
      </div>

      <div className="card-base p-4">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
          Book
        </h3>
        <p className="mt-2 text-[14px] font-semibold text-slate-900 dark:text-white">
          {selectedBook?.title?.trim() || "Ingen bok vald"}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-600 dark:text-white/70">
          {selectedBook?.description
            ? truncate(selectedBook.description, 220)
            : "Valj en bok for att starta trailer-flodet."}
        </p>
      </div>

      <div className="card-base p-4">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
          Output
        </h3>

        {state.generate.status === "loading" && (
          <p className="mt-2 text-[12px] text-slate-600 dark:text-white/70">Genererar scener...</p>
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
                <p className="font-semibold">Scene {index + 1}</p>
                <p className="mt-1 leading-relaxed">{truncate(scene.visual_prompt, 160)}</p>
              </article>
            ))}

            {state.generate.caption.trim().length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80">
                <p className="font-semibold">Caption</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                  {truncate(state.generate.caption, 220)}
                </p>
              </div>
            )}
          </div>
        ) : (
          state.generate.status !== "loading" && (
            <p className="mt-2 text-[12px] text-slate-500 dark:text-white/50">
              Scener visas har efter steg 4.
            </p>
          )
        )}

        {state.build.status === "building" && (
          <p className="mt-3 text-[12px] text-slate-600 dark:text-white/70">
            Bygger trailer. Det kan ta upp till nagon minut.
          </p>
        )}

        {state.build.status === "completed" && (
          <p className="mt-3 text-[12px] text-emerald-700 dark:text-emerald-300">
            Trailer ar klar.
          </p>
        )}
      </div>
    </aside>
  );
}
