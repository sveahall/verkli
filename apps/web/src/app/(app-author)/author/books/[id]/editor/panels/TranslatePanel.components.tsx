"use client";

import { getLanguageLabel, isSupportedLanguage, type SupportedLanguage } from "@/lib/languages";
import { isTranslationPairSupported } from "@/lib/translation-pairs";

/** Languages shown in "Translate into more languages" card (design list). */
const TRANSLATE_MORE_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "ru", label: "Russian" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "ar", label: "Arabic" },
  { code: "no", label: "Norwegian" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
];

// ── TranslatePreviewPanes ─────────────────────────────────────────────────────

interface TranslatePreviewPanesProps {
  targetLanguage: SupportedLanguage;
  translateScope: "book" | "chapter";
  isProLocked: boolean;
  loadingPreview: boolean;
  originalPreview: string;
  translationPreview: string;
  previewUnavailable: boolean;
  translating: boolean;
  billingLoading: boolean;
  sourceVersionId: string | null;
  onTranslate: () => void;
}

export function TranslatePreviewPanes({
  targetLanguage,
  translateScope,
  isProLocked,
  loadingPreview,
  originalPreview,
  translationPreview,
  previewUnavailable,
  translating,
  billingLoading,
  sourceVersionId,
  onTranslate,
}: TranslatePreviewPanesProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10">
        <div className="bg-slate-100 px-5 py-3 dark:bg-white/[0.06]">
          <p className="text-sm font-medium text-slate-700 dark:text-white/80">Original text</p>
        </div>
        <div className="h-[340px] overflow-y-auto bg-slate-50/50 px-5 py-4 text-sm leading-relaxed text-slate-700 dark:bg-white/[0.02] dark:text-slate-200">
          {loadingPreview ? (
            <span className="text-slate-400">Loading...</span>
          ) : originalPreview ? (
            originalPreview
          ) : (
            <span className="text-slate-400">No source text available yet.</span>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10">
        <div className="bg-slate-100 px-5 py-3 dark:bg-white/[0.06]">
          <p className="text-sm font-medium text-slate-700 dark:text-white/80">
            {getLanguageLabel(targetLanguage)} preview
          </p>
        </div>
        <div className="h-[340px] overflow-y-auto bg-slate-50/50 px-5 py-4 text-sm leading-relaxed text-slate-700 dark:bg-white/[0.02] dark:text-slate-200">
          {loadingPreview ? (
            <span className="text-slate-400">Loading...</span>
          ) : translationPreview ? (
            translationPreview
          ) : previewUnavailable ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-4 py-3 text-slate-500 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-white/60">
              Translation preview is temporarily unavailable for this language pair.
            </div>
          ) : (
            <span className="text-slate-400">Preview will appear here.</span>
          )}
        </div>
        <div className="px-5 py-4">
          <button
            type="button"
            onClick={onTranslate}
            disabled={translating || billingLoading || !sourceVersionId}
            className="block w-full rounded-full bg-[#907AFF] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {translating
              ? "Translating..."
              : translateScope === "chapter" && !isProLocked
                ? "Translate chapter"
                : "Translate full book"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TranslateMoreLanguagesCard ────────────────────────────────────────────────

interface TranslateMoreLanguagesCardProps {
  sourceLanguage: SupportedLanguage;
  selectedLanguages: Set<string>;
  onToggleLanguage: (code: string) => void;
}

export function TranslateMoreLanguagesCard({
  sourceLanguage,
  selectedLanguages,
  onToggleLanguage,
}: TranslateMoreLanguagesCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-white/[0.03] dark:ring-white/10">
      <div className="px-6 py-6">
        <h3 className="mb-4 text-[15px] font-semibold text-slate-900 dark:text-white">
          Translate into more languages:
        </h3>
        <ul className="max-h-[260px] divide-y divide-slate-100 overflow-y-auto text-sm dark:divide-white/[0.06]">
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
                      if (supported) onToggleLanguage(code);
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
  );
}
