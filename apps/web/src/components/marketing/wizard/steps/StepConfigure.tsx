"use client";

import { useId, useState } from "react";
import { useTrailerWizard } from "@/components/marketing/wizard/WizardContext";
import {
  GENRE_OPTIONS,
  GENRE_TONE_MAP,
  TONE_LABELS,
} from "@/components/marketing/wizard/wizard-machine";

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_KEYWORDS = 10;

export default function StepConfigure() {
  const {
    state,
    setGenre,
    setTone,
    setDescription,
    setKeywords,
    canGoBack,
    canGoNext,
    goBack,
    goNext,
  } = useTrailerWizard();
  const descriptionId = useId();
  const keywordsId = useId();
  const [keywordInput, setKeywordInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedGenre = state.feeling.genre;
  const selectedTone = state.feeling.tone;
  const availableTones = selectedGenre ? GENRE_TONE_MAP[selectedGenre] : [];
  const description = state.story.description;
  const keywords = state.story.keywords;

  const handleAddKeyword = () => {
    const trimmed = keywordInput.trim();
    if (
      trimmed.length === 0 ||
      keywords.length >= MAX_KEYWORDS ||
      keywords.includes(trimmed)
    )
      return;
    setKeywords([...keywords, trimmed]);
    setKeywordInput("");
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  return (
    <section className="space-y-4">
      {/* Auto-configured banner */}
      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-950/20">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className="shrink-0 text-emerald-500"
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
        <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-300">
          Allt har fyllts i automatiskt baserat på din bok. Justera vid behov.
        </p>
      </div>

      <div className="card-base p-6">
        {/* Genre */}
        <div>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-white/40">
            Genre
          </p>
          <div className="flex flex-wrap gap-2">
            {GENRE_OPTIONS.map((option) => {
              const isSelected = selectedGenre === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setGenre(option.value)}
                  className={`rounded-full border px-4 py-2 text-[13px] font-medium transition ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70 dark:hover:border-white/20"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tone */}
        {selectedGenre && availableTones.length > 0 && (
          <div className="mt-5">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-white/40">
              Ton
            </p>
            <div className="flex flex-wrap gap-2">
              {availableTones.map((tone) => {
                const isSelected = selectedTone === tone;
                return (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setTone(tone)}
                    className={`rounded-full border px-4 py-2 text-[13px] font-medium transition ${
                      isSelected
                        ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70 dark:hover:border-white/20"
                    }`}
                  >
                    {TONE_LABELS[tone]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="my-5 border-t border-slate-100 dark:border-white/5" />

        {/* Keywords */}
        <div>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-white/40">
            Nyckelord ({keywords.length}/{MAX_KEYWORDS})
          </p>

          {keywords.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-medium text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/60"
                >
                  {keyword}
                  <button
                    type="button"
                    onClick={() => handleRemoveKeyword(keyword)}
                    className="text-slate-400 transition hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70"
                    aria-label={`Ta bort ${keyword}`}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                    >
                      <path
                        d="M2 2L8 8M8 2L2 8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              id={keywordsId}
              type="text"
              className="input-base flex-1"
              placeholder="Lägg till nyckelord..."
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={keywords.length >= MAX_KEYWORDS}
            />
            <button
              type="button"
              onClick={handleAddKeyword}
              disabled={
                keywordInput.trim().length === 0 ||
                keywords.length >= MAX_KEYWORDS
              }
              className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30"
            >
              Lägg till
            </button>
          </div>
        </div>

        {/* Advanced: description (collapsed by default) */}
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-white/5">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-[12px] font-medium text-slate-400 transition hover:text-slate-600 dark:text-white/40 dark:hover:text-white/60"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}
            >
              <path
                d="M4.5 2.5L8 6L4.5 9.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Avancerat: Beskrivning
            {description.length > 0 && (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                ifylld
              </span>
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3">
              <textarea
                id={descriptionId}
                className="input-base min-h-[100px] resize-y text-[14px] leading-relaxed"
                placeholder="Beskriv handlingen eller temat..."
                maxLength={MAX_DESCRIPTION_LENGTH}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="mt-1 flex justify-end text-[11px] tabular-nums text-slate-400 dark:text-white/30">
                {description.length} / {MAX_DESCRIPTION_LENGTH}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={goBack}
          disabled={!canGoBack}
          className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30"
        >
          Tillbaka
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#907AFF] to-[#6C5CE7] px-6 py-3 text-[15px] font-medium text-white shadow-sm transition hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Generera scener
        </button>
      </div>
    </section>
  );
}
