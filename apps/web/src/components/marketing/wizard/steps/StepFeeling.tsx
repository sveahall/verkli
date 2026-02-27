"use client";
import { useTrailerWizard } from "@/components/marketing/wizard/WizardContext";
import { GENRE_OPTIONS, GENRE_TONE_MAP, TONE_LABELS } from "@/components/marketing/wizard/wizard-machine";
export default function StepFeeling() {
  const { state, setGenre, setTone, canGoBack, canGoNext, goBack, goNext } = useTrailerWizard();
  const selectedGenre = state.feeling.genre;
  const selectedTone = state.feeling.tone;
  const availableTones = selectedGenre ? GENRE_TONE_MAP[selectedGenre] : [];
  return (
    <section className="space-y-4">
      <div className="card-base p-5">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Känsla</h2>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">Välj genre och ton för din trailer.</p>
        <div className="mt-5"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-white/50">Genre</p>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{GENRE_OPTIONS.map((option) => { const isSelected = selectedGenre === option.value; return (<button key={option.value} type="button" onClick={() => setGenre(option.value)} className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition ${isSelected ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80 dark:hover:border-white/20"}`}>{option.label}</button>); })}</div>
        </div>
        {selectedGenre && <div className="mt-5"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-white/50">Ton</p><div className="flex flex-wrap gap-2">{availableTones.map((tone) => { const isSelected = selectedTone === tone; return (<button key={tone} type="button" onClick={() => setTone(tone)} className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition ${isSelected ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70 dark:hover:border-white/20"}`}>{TONE_LABELS[tone]}</button>); })}</div></div>}
      </div>
      <div className="flex justify-between"><button type="button" onClick={goBack} disabled={!canGoBack} className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30">Tillbaka</button><button type="button" onClick={goNext} disabled={!canGoNext} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">Fortsätt</button></div>
    </section>
  );
}
