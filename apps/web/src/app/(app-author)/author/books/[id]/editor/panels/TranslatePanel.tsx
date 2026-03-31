"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getLanguageLabel, LANGUAGE_OPTIONS, isSupportedLanguage, type SupportedLanguage } from "@/lib/languages";
import { isTranslationPairSupported } from "@/lib/translation-pairs";
import TranslationCheckoutModal from "./TranslationCheckoutModal";
import { TranslateMoreLanguagesCard, TranslatePreviewPanes } from "./TranslatePanel.components";

export type TranslatePanelChapter = { id: string; title: string | null };

export type TranslatePanelProps = {
  bookId: string;
  bookTitle: string;
  authorDisplayName: string;
  bookLengthLabel: string;
  sourceLanguage: SupportedLanguage;
  sourceVersionId: string | null;
  isProLocked?: boolean;
  /** True while billing state is still loading — buttons should wait. */
  billingLoading?: boolean;
  /** Chapters for chapter-level translation (Pro only). */
  chapters?: TranslatePanelChapter[];
  /** Currently selected chapter in the editor. */
  selectedChapterId?: string | null;
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
  billingLoading = false,
  chapters = [],
  selectedChapterId = null,
  onMessage,
  hideTitle = false,
}: TranslatePanelProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

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

  const [translateScope, setTranslateScope] = useState<"book" | "chapter">("book");

  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutLanguages, setCheckoutLanguages] = useState<string[]>([]);
  const checkoutHandledRef = useRef(false);

  const sourceLabel = getLanguageLabel(sourceLanguage);

  // Handle return from Stripe checkout
  useEffect(() => {
    if (checkoutHandledRef.current) return;
    const checkoutStatus = searchParams?.get("translation_checkout");
    const sessionId = searchParams?.get("session_id");
    const languagesParam = searchParams?.get("languages");

    if (checkoutStatus === "success" && sessionId && languagesParam && sourceVersionId) {
      checkoutHandledRef.current = true;
      const url = new URL(window.location.href);
      url.searchParams.delete("translation_checkout");
      url.searchParams.delete("session_id");
      url.searchParams.delete("languages");
      router.replace(url.pathname + url.search, { scroll: false });

      const langs = languagesParam.split(",").filter(Boolean);
      void triggerPaidTranslation(langs, sessionId);
    }
  }, [searchParams, sourceVersionId, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerPaidTranslation = useCallback(async (languages: string[], stripeSessionId: string) => {
    if (!bookId || !sourceVersionId) return;
    setTranslating(true);
    setSuccessMessage(null);
    onMessage?.(null);
    try {
      const succeeded: string[] = [];
      const failed: Array<{ lang: string; error: string }> = [];
      for (const lang of languages) {
        try {
          const res = await fetch(`/api/books/${bookId}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetLanguage: lang,
              sourceVersionId,
              overwrite: false,
              stripeSessionId,
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
          `Payment successful! Started translation for: ${succeeded.map((l) => getLanguageLabel(l)).join(", ")}.`
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
  }, [bookId, sourceVersionId, onMessage]);

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

  const previewAbortRef = useRef<AbortController | null>(null);

  const fetchPreview = useCallback(async () => {
    if (!bookId || !targetLanguage) return;

    // Abort any in-flight preview request to prevent stale responses overwriting state
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;

    setLoadingPreview(true);
    setTranslationPreview("");
    setPreviewUnavailable(false);
    try {
      const res = await fetch(
        `/api/books/${bookId}/translation-preview?targetLanguage=${encodeURIComponent(targetLanguage)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;

      const data = await res.json().catch(() => ({}));
      if (controller.signal.aborted) return;

      const nextOriginalPreview = typeof data.originalText === "string" ? data.originalText : "";
      const nextTranslationPreview = typeof data.previewText === "string" ? data.previewText : "";
      const nextPreviewUnavailable = Boolean(data?.previewUnavailable);

      if (res.ok && data) {
        setOriginalPreview(nextOriginalPreview);
        setTranslationPreview(nextTranslationPreview);
        setPreviewUnavailable(nextPreviewUnavailable);
      } else {
        setTranslationPreview("");
        setPreviewUnavailable(false);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setTranslationPreview("");
      setPreviewUnavailable(false);
    } finally {
      if (!controller.signal.aborted) {
        setLoadingPreview(false);
      }
    }
  }, [bookId, targetLanguage]);

  useEffect(() => {
    void fetchPreview();
  }, [fetchPreview]);

  const handleTranslateFullBook = useCallback(async () => {
    if (!bookId || !sourceVersionId || translating || billingLoading) return;
    const toTranslate = Array.from(selectedLanguages).filter((code) =>
      isSupportedLanguage(code)
    ) as SupportedLanguage[];
    if (toTranslate.length === 0) {
      onMessage?.("Select at least one language.");
      return;
    }

    if (isProLocked) {
      setCheckoutLanguages(toTranslate);
      setCheckoutModalOpen(true);
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
  }, [bookId, sourceVersionId, selectedLanguages, translating, billingLoading, isProLocked, onMessage]);

  const handleTranslateSingleLanguage = useCallback(async () => {
    if (!bookId || !sourceVersionId || translating || billingLoading || !isSupportedLanguage(targetLanguage)) return;

    if (isProLocked) {
      setCheckoutLanguages([targetLanguage]);
      setCheckoutModalOpen(true);
      return;
    }

    if (translateScope === "chapter" && !selectedChapterId) {
      onMessage?.("Select a chapter first.");
      return;
    }

    setTranslating(true);
    setSuccessMessage(null);
    onMessage?.(null);
    try {
      const body: Record<string, unknown> = {
        targetLanguage,
        sourceVersionId,
        overwrite: false,
      };
      if (translateScope === "chapter" && selectedChapterId) {
        body.chapterId = selectedChapterId;
      }
      const res = await fetch(`/api/books/${bookId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        onMessage?.(data?.error ?? "Could not start translation.");
        setTranslating(false);
        return;
      }
      const scopeLabel = translateScope === "chapter" ? "Chapter translation" : "Translation";
      setSuccessMessage(`${scopeLabel} started. Progress handled by background worker.`);
      onMessage?.(null);
    } catch {
      onMessage?.("Could not start translation. Try again.");
    } finally {
      setTranslating(false);
    }
  }, [bookId, sourceVersionId, targetLanguage, translating, billingLoading, isProLocked, translateScope, selectedChapterId, onMessage]);

  const handleProSubscribe = useCallback(() => {
    setCheckoutModalOpen(false);
    window.location.href = "/author/billing";
  }, []);

  const toggleLanguage = (code: string) => {
    setSelectedLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const targetOptions = LANGUAGE_OPTIONS.filter((opt) => opt.value !== sourceLanguage);
  const selectedForDisplay = Array.from(selectedLanguages)
    .filter((code) => isSupportedLanguage(code) && isTranslationPairSupported(sourceLanguage, code))
    .map((code) => ({ code, label: getLanguageLabel(code) }));

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {!hideTitle && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {bookTitle}
            </h1>
            <p className="mt-1 text-[15px] text-slate-500 dark:text-white/50">{authorDisplayName}</p>
          </div>
          <p className="text-sm mt-8 text-slate-500 dark:text-white/50">Book length: {bookLengthLabel}</p>
        </div>
      )}
      {hideTitle && (
        <p className="text-sm text-slate-500 dark:text-white/50">Book length: {bookLengthLabel}</p>
      )}

      {/* TRANSLATE section */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/50">
            Translate
          </h2>
          <div className="relative flex items-center gap-3 text-[15px]" ref={targetDropdownRef}>
            <span className="font-medium text-slate-700 dark:text-white/90">{sourceLabel}</span>
            <span className="text-slate-400 dark:text-white/40">&rarr;</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setTargetDropdownOpen((open) => !open)}
                className="flex items-center gap-3 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
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
                  className="absolute left-0 top-full z-10 mt-1 max-h-60 w-full min-w-[140px] overflow-auto rounded-lg border border-black/[0.08] bg-white py-1 shadow-lg dark:border-white/[0.08] dark:bg-slate-900 dark:text-white"
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

        {/* Scope selector – Pro users only */}
        {!isProLocked && chapters.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTranslateScope("book")}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                translateScope === "book"
                  ? "bg-[#907AFF] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/10"
              }`}
            >
              Full book
            </button>
            <button
              type="button"
              onClick={() => setTranslateScope("chapter")}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                translateScope === "chapter"
                  ? "bg-[#907AFF] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/10"
              }`}
            >
              Current chapter
            </button>
            {translateScope === "chapter" && selectedChapterId && (
              <span className="ml-2 text-xs text-slate-500 dark:text-white/50">
                {chapters.find((ch) => ch.id === selectedChapterId)?.title ?? "Untitled"}
              </span>
            )}
          </div>
        )}

        <TranslatePreviewPanes
          targetLanguage={targetLanguage}
          translateScope={translateScope}
          isProLocked={isProLocked}
          loadingPreview={loadingPreview}
          originalPreview={originalPreview}
          translationPreview={translationPreview}
          previewUnavailable={previewUnavailable}
          translating={translating}
          billingLoading={billingLoading}
          sourceVersionId={sourceVersionId}
          onTranslate={() => void handleTranslateSingleLanguage()}
        />
      </div>

      {/* Two cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-white/[0.03] dark:ring-white/10">
          <div className="space-y-5 px-6 py-6">
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                Increase your sales
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-white/70">
                Reach more readers by translating your book into more languages.
              </p>
            </div>
            <div className="rounded-xl border border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-white/80">Translate to:</p>
              {selectedForDisplay.length ? (
                <ul className="space-y-1 text-sm text-slate-600 dark:text-white/70">
                  {selectedForDisplay.map((l) => (
                    <li key={l.code} className="flex items-center gap-2">
                      <span className="text-slate-400">&bull;</span>
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
              disabled={translating || billingLoading || !sourceVersionId}
              className="block w-full rounded-full bg-[#907AFF] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {translating ? "Translating..." : "Translate full book"}
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-6 py-4 text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:border-white/10 dark:text-white/50">
            <span>OPTIMISED FOR BOOKS</span>
            <span className="text-[#907AFF]">&middot;</span>
            <span>CONTEXT AWARE</span>
            <span className="text-[#907AFF]">&middot;</span>
            <span>EDITABLE</span>
          </div>
        </div>

        <TranslateMoreLanguagesCard
          sourceLanguage={sourceLanguage}
          selectedLanguages={selectedLanguages}
          onToggleLanguage={toggleLanguage}
        />
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

      {/* Payment modal */}
      <TranslationCheckoutModal
        open={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        bookId={bookId}
        sourceVersionId={sourceVersionId ?? ""}
        languages={checkoutLanguages}
        onProSubscribe={handleProSubscribe}
      />
    </div>
  );
}
