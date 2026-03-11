"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getLanguageLabel, LANGUAGE_OPTIONS, isSupportedLanguage, type SupportedLanguage } from "@/lib/languages";
import { isTranslationPairSupported } from "@/lib/translation-pairs";

/** Languages shown in "Translate into more languages" card (design list). Codes used for API where supported. */
const TRANSLATE_MORE_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "fr", label: "French" },
  { code: "no", label: "Norwegian" },
  { code: "de", label: "German" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "ru", label: "Russian" },
  { code: "ko", label: "Korean" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
];

export type TranslatePanelProps = {
  bookId: string;
  bookTitle: string;
  authorDisplayName: string;
  bookLengthLabel: string;
  sourceLanguage: SupportedLanguage;
  sourceVersionId: string | null;
  isProLocked?: boolean;
  onMessage?: (message: string | null) => void;
  /** When true, do not render the book title/author row (parent shows shared header). */
  hideTitle?: boolean;
};

export default function TranslatePanel({
  bookId,
  bookTitle,
  authorDisplayName,
  bookLengthLabel,
  sourceLanguage,
  sourceVersionId,
  isProLocked = false,
  onMessage,
  hideTitle = false,
}: TranslatePanelProps) {
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>(() => {
    const preferred = sourceLanguage === "sv" ? "en" : "sv";
    return isSupportedLanguage(preferred) ? preferred : "en";
  });
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(() => {
    const defaultTarget = sourceLanguage === "sv" ? "en" : sourceLanguage === "en" ? "sv" : "en";
    return isTranslationPairSupported(sourceLanguage, defaultTarget) ? new Set([defaultTarget]) : new Set();
  });
  const [originalPreview, setOriginalPreview] = useState<string>("");
  const [translationPreview, setTranslationPreview] = useState<string>("");
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [targetDropdownOpen, setTargetDropdownOpen] = useState(false);
  const targetDropdownRef = useRef<HTMLDivElement>(null);

  const sourceLabel = getLanguageLabel(sourceLanguage);

  useEffect(() => {
    if (!targetDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(e.target as Node)) {
        setTargetDropdownOpen(false);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [targetDropdownOpen]);

  const fetchPreview = useCallback(async () => {
    if (!bookId || !targetLanguage) return;
    setLoadingPreview(true);
    try {
      const res = await fetch(
        `/api/books/${bookId}/translation-preview?targetLanguage=${encodeURIComponent(targetLanguage)}`
      );
      const data = await res.json().catch(() => ({}));
      const nextOriginalPreview = typeof data.originalText === "string" ? data.originalText : "";
      const nextTranslationPreview = typeof data.previewText === "string" ? data.previewText : "";
      const nextPreviewUnavailable = Boolean(data?.previewUnavailable);

      if (res.ok && data) {
        setOriginalPreview(nextOriginalPreview);
        setTranslationPreview(nextTranslationPreview);
        setPreviewUnavailable(nextPreviewUnavailable);
      } else {
        setOriginalPreview("");
        setTranslationPreview("");
        setPreviewUnavailable(false);
      }
    } catch {
      setOriginalPreview("");
      setTranslationPreview("");
      setPreviewUnavailable(false);
    } finally {
      setLoadingPreview(false);
    }
  }, [bookId, targetLanguage]);

  useEffect(() => {
    void fetchPreview();
  }, [fetchPreview]);

  const handleTranslateFullBook = useCallback(async () => {
    if (!bookId || !sourceVersionId || translating || isProLocked) return;
    const toTranslate = Array.from(selectedLanguages).filter((code) =>
      isSupportedLanguage(code)
    ) as SupportedLanguage[];
    if (toTranslate.length === 0) {
      onMessage?.("Select at least one language.");
      return;
    }
    setTranslating(true);
    setSuccessMessage(null);
    onMessage?.(null);
    try {
      const succeeded: string[] = [];
      const failed: Array<{ lang: string; error: string }> = [];
      for (const lang of toTranslate) {
        try {
          const res = await fetch(`/api/books/${bookId}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetLanguage: lang,
              sourceVersionId,
              overwrite: false,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.ok === false) {
            failed.push({ lang, error: data?.error ?? "Unknown error" });
          } else {
            succeeded.push(lang);
          }
        } catch {
          failed.push({ lang, error: "Network error" });
        }
      }
      if (succeeded.length > 0) {
        setSuccessMessage(
          `Started translation for: ${succeeded.map((l) => getLanguageLabel(l)).join(", ")}.`
        );
      }
      if (failed.length > 0) {
        onMessage?.(
          `Failed: ${failed.map((f) => `${getLanguageLabel(f.lang)} (${f.error})`).join(", ")}`
        );
      } else {
        onMessage?.(null);
      }
    } catch {
      onMessage?.("Could not start translation. Try again.");
    } finally {
      setTranslating(false);
    }
  }, [bookId, sourceVersionId, selectedLanguages, translating, isProLocked, onMessage]);

  const handleTranslateSingleLanguage = useCallback(async () => {
    if (!bookId || !sourceVersionId || translating || isProLocked || !isSupportedLanguage(targetLanguage)) return;
    setTranslating(true);
    setSuccessMessage(null);
    onMessage?.(null);
    try {
      const res = await fetch(`/api/books/${bookId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLanguage,
          sourceVersionId,
          overwrite: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        onMessage?.(data?.error ?? "Could not start translation.");
        setTranslating(false);
        return;
      }
      setSuccessMessage("Translation started. Progress handled by background worker.");
      onMessage?.(null);
    } catch {
      onMessage?.("Could not start translation. Try again.");
    } finally {
      setTranslating(false);
    }
  }, [bookId, sourceVersionId, targetLanguage, translating, isProLocked, onMessage]);

  const toggleLanguage = (code: string) => {
    setSelectedLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const targetOptions = LANGUAGE_OPTIONS.filter((opt) => opt.value !== sourceLanguage);
  const selectedForDisplay = TRANSLATE_MORE_LANGUAGES.filter((l) => selectedLanguages.has(l.code));

  return (
    <div className="space-y-10">
      {!hideTitle && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {bookTitle}
            </h1>
            <p className="mt-1 text-[15px] text-slate-500 dark:text-white/50">{authorDisplayName}</p>
          </div>
          <p className="text-sm text-slate-500 dark:text-white/50">Book length: {bookLengthLabel}</p>
        </div>
      )}
      {hideTitle && (
        <p className="text-sm text-slate-500 dark:text-white/50">Book length: {bookLengthLabel}</p>
      )}

      {/* TRANSLATE section */}
      <div>
        <div className="mb-6 flex flex-wrap items-center gap-x-10 gap-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/50">
            Translate
          </h2>
          <div className="relative flex items-center gap-3 text-[15px]" ref={targetDropdownRef}>
            <span className="font-medium text-slate-700 dark:text-white/90">{sourceLabel}</span>
            <span className="text-slate-400 dark:text-white/40">→</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setTargetDropdownOpen((open) => !open)}
                className="flex items-center gap-3 rounded-md border border-black/[0.08] bg-white pl-3 pr-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                aria-haspopup="listbox"
                aria-expanded={targetDropdownOpen}
              >
                <span>{getLanguageLabel(targetLanguage)}</span>
                <svg className="h-4 w-4 shrink-0 text-slate-500 dark:text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {targetDropdownOpen && (
                <ul
                  className="absolute left-0 top-full z-10 mt-1 max-h-60 w-full min-w-[140px] overflow-auto rounded-md border border-black/[0.08] bg-white py-1 shadow-lg dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
                  role="listbox"
                >
                  {targetOptions.map((opt) => (
                    <li key={opt.value} role="option" aria-selected={opt.value === targetLanguage}>
                      <button
                        type="button"
                        onClick={() => {
                          setTargetLanguage(opt.value as SupportedLanguage);
                          setTargetDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-white/10 ${
                          opt.value === targetLanguage ? "bg-slate-50 font-medium dark:bg-white/5" : ""
                        }`}
                      >
                        {opt.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10">
            <div className="bg-slate-100 px-5 py-3 dark:bg-white/[0.06]">
              <p className="text-sm font-medium text-slate-700 dark:text-white/80">Original text</p>
            </div>
            <div className="h-[380px] overflow-y-auto bg-slate-50/50 px-5 py-4 text-sm leading-relaxed text-slate-700 dark:bg-white/[0.02] dark:text-slate-200">
              {loadingPreview ? (
                <span className="text-slate-400">Loading...</span>
              ) : originalPreview ? (
                originalPreview
              ) : (
                <span className="text-slate-400">No source text available yet.</span>
              )}
            </div>
          </div>
          <div className="flex flex-col overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10">
            <div className="bg-slate-100 px-5 py-3 dark:bg-white/[0.06]">
              <p className="text-sm font-medium text-slate-700 dark:text-white/80">
                {getLanguageLabel(targetLanguage)} preview
              </p>
            </div>
            <div className="h-[320px] overflow-y-auto bg-slate-50/50 px-5 py-4 text-sm leading-relaxed text-slate-700 dark:bg-white/[0.02] dark:text-slate-200">
              {loadingPreview ? (
                <span className="text-slate-400">Loading...</span>
              ) : translationPreview ? (
                translationPreview
              ) : previewUnavailable ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-4 py-3 text-slate-500 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-white/60">
                  Translation preview is unavailable on this machine until the local Opus MT model is installed.
                </div>
              ) : (
                <span className="text-slate-400">Preview will appear here.</span>
              )}
            </div>
            <div className="bg-slate-50/50 px-0 py-5 dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={() => void handleTranslateSingleLanguage()}
                disabled={translating || isProLocked || !sourceVersionId}
                className="mx-auto block w-9/10 rounded-full bg-[#907AFF] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {translating ? "Translating..." : "Translate full book"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Two cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-white/[0.03] dark:ring-white/10">
          <div className="px-6 pb-4 pt-8">
            <h3 className="mb-2 text-[15px] font-semibold text-slate-900 dark:text-white">
              Increase your sales
            </h3>
            <p className="mb-6 text-sm text-slate-600 dark:text-white/70">
              Reach more readers by translating your book into more languages.
            </p>
            <div className="mb-8 rounded-xl border border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-white/80">Translate to:</p>
              {selectedForDisplay.length ? (
                <ul className="space-y-1 text-sm text-slate-600 dark:text-white/70">
                  {selectedForDisplay.map((l) => (
                    <li key={l.code} className="flex items-center gap-2">
                      <span className="text-slate-400">•</span>
                      {l.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400 dark:text-white/40">No languages selected</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleTranslateFullBook()}
              disabled={translating || isProLocked || !sourceVersionId}
              className="mx-auto mb-4 block w-full rounded-full bg-[#907AFF] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {translating ? "Translating..." : "Translate full book"}
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-6 py-5 text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:border-white/10 dark:text-white/50">
            <span>OPTIMISED FOR BOOKS</span>
            <span className="text-[#907AFF]">·</span>
            <span>CONTEXT AWARE</span>
            <span className="text-[#907AFF]">·</span>
            <span>EDITABLE</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white px-6 pb-6 pt-6 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.03] dark:ring-white/10">
          <h3 className="mb-4 text-[15px] font-semibold text-slate-900 dark:text-white">
            Translate into more languages:
          </h3>
          <ul className="max-h-[225px] divide-y divide-slate-100 overflow-y-auto text-sm dark:divide-white/[0.06]">
            {TRANSLATE_MORE_LANGUAGES.map(({ code, label }) => {
              const isSource = code === sourceLanguage;
              const supported = !isSource && isSupportedLanguage(code) && isTranslationPairSupported(sourceLanguage, code);
              return (
                <li key={code}>
                  <label
                    className={`flex items-center justify-between py-2.5 ${
                      supported ? "cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <span className={supported || isSource ? "text-slate-700 dark:text-white/80" : "text-slate-400 dark:text-white/30"}>
                      {label}
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedLanguages.has(code)}
                      onChange={() => {
                        if (supported) toggleLanguage(code);
                      }}
                      disabled={!supported}
                      aria-label={`Translate to ${label}`}
                      className="h-4 w-4 rounded border-slate-300 accent-[#907AFF] disabled:opacity-40"
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Status */}
      {successMessage && (
        <div
          className="rounded-lg border border-[#907AFF]/40 bg-[#907AFF]/10 px-4 py-3 text-sm text-[#5c4bb8] dark:border-[#907AFF]/40 dark:bg-[#907AFF]/15 dark:text-[#b8a9ff]"
          role="status"
        >
          {successMessage}
        </div>
      )}
    </div>
  );
}
