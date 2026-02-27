"use client";
import { useId, useState } from "react";
import { useTrailerWizard } from "@/components/marketing/wizard/WizardContext";
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_KEYWORDS = 10;
export default function StepStory() {
  const { state, selectedBook, setDescription, setKeywords, canGoBack, canGoNext, goBack, goNext } = useTrailerWizard();
  const descriptionId = useId();
  const keywordsId = useId();
  const [keywordInput, setKeywordInput] = useState("");
  const description = state.story.description;
  const keywords = state.story.keywords;
  const handleDescriptionFocus = () => { if (description.length === 0 && selectedBook?.description && selectedBook.description.trim().length > 0) setDescription(selectedBook.description.trim()); };
  const handleAddKeyword = () => { const trimmed = keywordInput.trim(); if (trimmed.length === 0 || keywords.length >= MAX_KEYWORDS || keywords.includes(trimmed)) return; setKeywords([...keywords, trimmed]); setKeywordInput(""); };
  const handleRemoveKeyword = (keyword: string) => { setKeywords(keywords.filter((k) => k !== keyword)); };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { e.preventDefault(); handleAddKeyword(); } };
  return (
    <section className="space-y-4">
      <div className="card-base p-5">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Historia</h2>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">Beskriv handlingen och lägg till nyckelord.</p>
        <div className="mt-5"><label htmlFor={descriptionId} className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-white/60">Beskrivning</label><textarea id={descriptionId} className="input-base min-h-[120px] resize-y" placeholder="Beskriv handlingen i din bok..." maxLength={MAX_DESCRIPTION_LENGTH} value={description} onFocus={handleDescriptionFocus} onChange={(e) => setDescription(e.target.value)} /><div className="mt-1 flex justify-between text-[11px] text-slate-400 dark:text-white/30"><span>Fokusera på känslan och konflikten, inte handlingen.</span><span>{description.length} / {MAX_DESCRIPTION_LENGTH}</span></div></div>
        <div className="mt-5"><label htmlFor={keywordsId} className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-white/60">Nyckelord (min 1, max {MAX_KEYWORDS})</label><div className="flex gap-2"><input id={keywordsId} type="text" className="input-base flex-1" placeholder="Skriv ett nyckelord och tryck Enter" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} onKeyDown={handleKeyDown} disabled={keywords.length >= MAX_KEYWORDS} /><button type="button" onClick={handleAddKeyword} disabled={keywordInput.trim().length === 0 || keywords.length >= MAX_KEYWORDS} className="rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30">Lägg till</button></div>{keywords.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{keywords.map((keyword) => (<span key={keyword} className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[12px] text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/60">{keyword}<button type="button" onClick={() => handleRemoveKeyword(keyword)} className="ml-0.5 text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70" aria-label={"Ta bort " + keyword}><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button></span>))}</div>}</div>
      </div>
      <div className="flex justify-between"><button type="button" onClick={goBack} disabled={!canGoBack} className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30">Tillbaka</button><button type="button" onClick={goNext} disabled={!canGoNext} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">Fortsätt</button></div>
    </section>
  );
}
