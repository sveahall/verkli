"use client";
import { useEffect, useRef } from "react";
import { useTrailerWizard } from "@/components/marketing/wizard/WizardContext";
import { MAX_REGENERATE_ATTEMPTS } from "@/components/marketing/wizard/wizard-machine";
export default function StepPreviewScenes() {
  const { state, canGoBack, canGoNext, goBack, goNext, generateScenes, regenerateScenes } = useTrailerWizard();
  const hasTriggered = useRef(false);
  useEffect(() => { if (state.generate.status === "idle" && !hasTriggered.current) { hasTriggered.current = true; void generateScenes(); } }, [state.generate.status, generateScenes]);
  const isLoading = state.generate.status === "loading";
  const isReady = state.generate.status === "ready";
  const isError = state.generate.status === "error";
  const canRegenerate = state.generate.regenerateCount < MAX_REGENERATE_ATTEMPTS && !isLoading;
  if (isLoading) return (<section className="space-y-4"><div className="card-base p-5"><h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Förhandsgranska scener</h2><p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">Genererar scener...</p><div className="mt-4 space-y-3">{[1,2,3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />)}</div></div></section>);
  if (isError) return (<section className="space-y-4"><div className="card-base border-red-200 bg-red-50 p-5 dark:border-red-500/40 dark:bg-red-950/20"><p className="text-[13px] font-semibold text-red-700 dark:text-red-300">Kunde inte generera scener</p><p className="mt-1 text-[12px] text-red-600 dark:text-red-400">{state.generate.errorMessage}</p>{canRegenerate && <button type="button" onClick={() => void regenerateScenes()} className="btn-primary mt-3">Försök igen</button>}</div><div className="flex justify-start"><button type="button" onClick={goBack} disabled={!canGoBack} className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30">Tillbaka</button></div></section>);
  if (isReady) return (
    <section className="space-y-4">
      <div className="card-base p-5">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Förhandsgranska scener</h2>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">Granska de genererade scenerna innan du bygger trailern.</p>
        <div className="mt-4 space-y-3">{state.generate.scenes.map((scene, index) => (<div key={index} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-start justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-white/50">Scen {index + 1}</p><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/50">{scene.duration} sek</span></div><p className="mt-2 text-[13px] leading-relaxed text-slate-700 dark:text-white/80">{scene.visual_prompt}</p></div>))}</div>
        {state.generate.titleCard && <div className="mt-4"><p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-white/50">Titelkort</p><p className="text-[13px] text-slate-700 dark:text-white/80">{state.generate.titleCard}</p></div>}
        {state.generate.caption && <div className="mt-4"><p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-white/50">Caption</p><p className="text-[13px] leading-relaxed text-slate-600 dark:text-white/60">{state.generate.caption}</p></div>}
        {state.generate.hashtags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{state.generate.hashtags.map((tag) => <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/50">{tag}</span>)}</div>}
        {canRegenerate && <button type="button" onClick={() => void regenerateScenes()} className="mt-4 rounded-xl border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:border-slate-300 dark:border-white/20 dark:text-white/70 dark:hover:border-white/30">Generera om ({state.generate.regenerateCount}/{MAX_REGENERATE_ATTEMPTS})</button>}
      </div>
      <div className="flex justify-between"><button type="button" onClick={goBack} disabled={!canGoBack} className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30">Tillbaka</button><button type="button" onClick={goNext} disabled={!canGoNext} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">Fortsätt</button></div>
    </section>
  );
  return (<section className="card-base p-5 text-center"><p className="text-[13px] text-slate-500 dark:text-white/50">Laddar...</p></section>);
}
