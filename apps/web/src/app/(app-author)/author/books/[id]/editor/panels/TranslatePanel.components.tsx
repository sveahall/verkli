"use client";

import { useId, useState } from "react";
import { BookOpen, Check, Languages, RefreshCw, Search } from "lucide-react";
import { getLanguageLabel, LANGUAGE_OPTIONS, isSupportedLanguage, type SupportedLanguage } from "@/lib/languages";
import { isTranslationPairSupported } from "@/lib/translation-pairs";
import styles from "./TranslatePanel.module.css";

interface TranslatePreviewPanesProps {
  targetLanguage: SupportedLanguage;
  loadingPreview: boolean;
  originalPreview: string;
  translationPreview: string;
  previewUnavailable: boolean;
  previewError: string | null;
  onRetry: () => void;
}

export function TranslatePreviewPanes({ targetLanguage, loadingPreview, originalPreview, translationPreview, previewUnavailable, previewError, onRetry }: TranslatePreviewPanesProps) {
  const headingId = useId();
  return (
    <div className={styles.comparison} aria-busy={loadingPreview}>
      <article className={styles.page} aria-labelledby={`${headingId}-original`}>
        <header><h3 id={`${headingId}-original`}>Original text</h3><span>Opening excerpt</span></header>
        <div className={styles.manuscript} tabIndex={originalPreview ? 0 : undefined}>
          {originalPreview ? <p dir="auto">{originalPreview}</p> : <div className={styles.empty}>
            <BookOpen size={26} aria-hidden />
            <p>{loadingPreview ? "Opening your manuscript…" : previewError ? "Your manuscript is safe." : "Every translation starts with your words."}</p>
            <span>{loadingPreview ? "Loading the beginning of your book." : previewError ? "Try the preview again to load your text." : "Add text in Write to see an opening excerpt here."}</span>
          </div>}
        </div>
      </article>
      <article className={`${styles.page} ${styles.translated}`} aria-labelledby={`${headingId}-translated`}>
        <header><h3 id={`${headingId}-translated`}>{getLanguageLabel(targetLanguage)} preview</h3><span>{translationPreview ? "For your review" : "Opening excerpt"}</span></header>
        <div className={styles.manuscript} tabIndex={translationPreview ? 0 : undefined}>
          {loadingPreview ? <div className={styles.empty} role="status"><RefreshCw className={styles.spinner} size={26} aria-hidden /><p>Preparing your preview…</p><span>A first look at your words in {getLanguageLabel(targetLanguage)}.</span></div>
            : translationPreview ? <p dir="auto" lang={targetLanguage}>{translationPreview}</p>
              : <div className={styles.empty}>
                <Languages size={28} aria-hidden />
                <p>{previewError ? "Let’s try that again." : previewUnavailable ? "The preview is unavailable right now." : "A new language. The same story."}</p>
                <span role={previewError ? "alert" : undefined}>{previewError ?? (previewUnavailable ? "Your original text is unchanged. You can retry the preview." : "Your translated opening will appear here when a preview is available.")}</span>
                {(previewError || previewUnavailable || originalPreview) && <button type="button" className={styles.retry} onClick={onRetry}><RefreshCw size={15} aria-hidden />Retry preview</button>}
              </div>}
        </div>
      </article>
    </div>
  );
}

interface TranslateMoreLanguagesCardProps {
  sourceLanguage: SupportedLanguage;
  selectedLanguages: Set<string>;
  disabled?: boolean;
  onToggleLanguage: (code: string) => void;
}

export function TranslateMoreLanguagesCard({ sourceLanguage, selectedLanguages, disabled = false, onToggleLanguage }: TranslateMoreLanguagesCardProps) {
  const [query, setQuery] = useState("");
  const choices = LANGUAGE_OPTIONS.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <fieldset className={styles.languagePicker} disabled={disabled}>
      <legend>Choose languages</legend>
      <label className={styles.search}><Search size={17} aria-hidden /><input type="search" aria-label="Find a language" placeholder="Find a language" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className={styles.languageGrid}>
        {choices.map(({ value: code, label }) => {
          const isSource = code === sourceLanguage;
          const supported = !isSource && isSupportedLanguage(code) && isTranslationPairSupported(sourceLanguage, code);
          const selected = selectedLanguages.has(code);
          return <label key={code} className={styles.languageChoice} data-selected={selected && supported} data-unavailable={!supported}>
            <input type="checkbox" checked={selected && supported} disabled={!supported || disabled} aria-label={`Translate to ${label}`} onChange={() => supported && onToggleLanguage(code)} />
            <span className={styles.checkmark}>{selected && supported && <Check size={13} aria-hidden />}</span>
            <span>{label}{!supported && <small>{isSource ? "Original language" : "Not available"}</small>}</span>
          </label>;
        })}
        {!choices.length && <p className={styles.noResults} role="status">No matching languages. Try another name.</p>}
      </div>
    </fieldset>
  );
}
