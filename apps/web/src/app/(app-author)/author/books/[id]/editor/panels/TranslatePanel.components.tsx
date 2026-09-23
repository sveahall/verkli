"use client";

import { getLanguageLabel, isSupportedLanguage, LANGUAGE_OPTIONS, type SupportedLanguage } from "@/lib/languages";
import { isTranslationPairSupported } from "@/lib/translation-pairs";

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
        <div className="bg-muted px-5 py-3 dark:bg-card">
          <p className="text-sm font-medium text-foreground dark:text-foreground">Original text</p>
        </div>
        <div className="h-[340px] overflow-y-auto whitespace-pre-line bg-background/50 px-5 py-4 text-sm leading-relaxed text-foreground dark:bg-card dark:text-muted-foreground">
          {loadingPreview ? (
            <span className="text-muted-foreground">Loading...</span>
          ) : originalPreview ? (
            originalPreview
          ) : (
            <span className="text-muted-foreground">No source text available yet.</span>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10">
        <div className="bg-muted px-5 py-3 dark:bg-card">
          <p className="text-sm font-medium text-foreground dark:text-foreground">
            {getLanguageLabel(targetLanguage)} preview
          </p>
        </div>
        <div className="h-[340px] overflow-y-auto whitespace-pre-line bg-background/50 px-5 py-4 text-sm leading-relaxed text-foreground dark:bg-card dark:text-muted-foreground">
          {loadingPreview ? (
            <span className="text-muted-foreground">Loading...</span>
          ) : translationPreview ? (
            translationPreview
          ) : previewUnavailable ? (
            <div className="rounded-xl border border-dashed border-border bg-white/80 px-4 py-3 text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground">
              Translation preview is temporarily unavailable for this language pair.
            </div>
          ) : (
            <span className="text-muted-foreground">Preview will appear here.</span>
          )}
        </div>
        <div className="px-5 py-4">
          <button
            type="button"
            onClick={onTranslate}
            disabled={translating || billingLoading || !sourceVersionId}
            className="block w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-black/5 dark:bg-card dark:ring-white/10">
      <div className="px-6 py-6">
        <h3 className="mb-4 text-[15px] font-semibold text-foreground dark:text-foreground">
          Translate into more languages:
        </h3>
        <ul className="max-h-[260px] divide-y divide-border overflow-y-auto text-sm dark:divide-border">
          {LANGUAGE_OPTIONS.map(({ value: code, label }) => {
            const isSource = code === sourceLanguage;
            const supported = !isSource && isSupportedLanguage(code) && isTranslationPairSupported(sourceLanguage, code);
            return (
              <li key={code}>
                <label
                  className={`flex items-center justify-between py-2.5 ${
                    supported ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <span className={supported || isSource ? "text-foreground dark:text-foreground" : "text-muted-foreground dark:text-muted-foreground"}>
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
                    className="h-4 w-4 rounded border-border accent-[#907AFF] disabled:opacity-40"
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
