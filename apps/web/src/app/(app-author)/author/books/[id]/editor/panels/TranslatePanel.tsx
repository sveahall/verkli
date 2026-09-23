"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getLanguageLabel, LANGUAGE_OPTIONS, isSupportedLanguage, type SupportedLanguage } from "@/lib/languages";
import { resolveErrorMessage } from "@/lib/error-messages";
import { isTranslationPairSupported } from "@/lib/translation-pairs";
import { ArrowRight, BookOpen, ChevronDown, Languages, Check } from "lucide-react";
import styles from "./TranslatePanel.module.css";
import SavedTranslationComparison from "./SavedTranslationComparison";
import TranslationQualityCard from "./TranslationQualityCard";
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
  request?: typeof fetch;
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
  request = fetch,
}: TranslatePanelProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedTargetLanguage, setTargetLanguage] = useState<SupportedLanguage>(() => {
    const preferred = sourceLanguage === "sv" ? "en" : "sv";
    return isSupportedLanguage(preferred) ? preferred : "en";
  });
  // Edition changes can make the stored target become the source. Derive a
  // valid target before rendering so the select, labels and requests agree.
  const targetLanguage = selectedTargetLanguage === sourceLanguage
    ? (sourceLanguage === "sv" ? "en" : "sv")
    : selectedTargetLanguage;
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(() => {
    const defaultTarget = sourceLanguage === "sv" ? "en" : sourceLanguage === "en" ? "sv" : "en";
    return isTranslationPairSupported(sourceLanguage, defaultTarget) ? new Set([defaultTarget]) : new Set();
  });
  const [originalPreview, setOriginalPreview] = useState<string>("");
  const [translationPreview, setTranslationPreview] = useState<string>("");
  const [previewRequested, setPreviewRequested] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const reportMessage = useCallback((message: string | null) => {
    setActionError(message);
    onMessage?.(message);
  }, [onMessage]);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [pendingJobs, setPendingJobs] = useState<Array<{ id: string; language: string; startedAt: number }>>([]);

  const [translateScope, setTranslateScope] = useState<"book" | "chapter">("book");

  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutLanguages, setCheckoutLanguages] = useState<string[]>([]);
  const checkoutHandledRef = useRef(false);

  const sourceLabel = getLanguageLabel(sourceLanguage);

  const trackJob = useCallback((language: string, id: unknown) => {
    if (typeof id !== "string" || !id) return;
    setPendingJobs((jobs) => [...jobs.filter((job) => job.id !== id), { id, language, startedAt: Date.now() }]);
  }, []);

  useEffect(() => {
    if (pendingJobs.length === 0) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      const outcomes = await Promise.all(pendingJobs.map(async (job) => {
        const label = getLanguageLabel(job.language);
        if (Date.now() - job.startedAt >= 15 * 60_000) {
          return { id: job.id, message: `${label} translation may still be running. Use Refresh reports to check again later.` };
        }
        try {
          const response = await request(`/api/books/${bookId}/translation-quality?queueJobId=${encodeURIComponent(job.id)}`, { cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10_000)]) });
          if (!response.ok) return null;
          const result = await response.json();
          if (abort.signal.aborted) return null;
          const status = result?.queue?.status;
          if (status !== "completed" && status !== "failed") return null;
          window.dispatchEvent(new CustomEvent("translation-quality-updated", { detail: { bookId, targetLanguage: job.language } }));
          return {
            id: job.id,
            message: status === "failed"
              ? `${label} translation stopped. Open the saved quality report, if available, for details.`
              : result.queue.chapterId
                ? `${label} chapter translation job complete. Open the saved report to check its review status.`
                : `${label} translation job complete. Open the saved report to check its review status.`,
          };
        } catch { return null; }
      }));
      if (abort.signal.aborted) return;
      const finished = outcomes.filter((outcome) => outcome !== null);
      if (finished.length > 0) {
        setSuccessMessage(finished.map((outcome) => outcome.message).join(" "));
        setPendingJobs((jobs) => jobs.filter((job) => !finished.some((outcome) => outcome.id === job.id)));
        router.refresh();
      } else {
        timer = setTimeout(() => void poll(), 3000);
      }
    }
    void poll();
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, [bookId, pendingJobs, request, router]);

  const triggerPaidTranslation = useCallback(async (languages: string[], stripeSessionId: string) => {
    if (!bookId || !sourceVersionId) return;
    setTranslating(true);
    setSuccessMessage(null);
    reportMessage(null);
    try {
      const succeeded: string[] = [];
      const failed: Array<{ lang: string; error: string }> = [];
      for (const lang of languages) {
        try {
          const res = await request(`/api/books/${bookId}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetLanguage: lang,
              sourceLanguage,
              sourceVersionId,
              overwrite: false,
              stripeSessionId,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.ok === false) {
            failed.push({ lang, error: resolveErrorMessage(data?.error, "Could not start translation.") });
          } else {
            succeeded.push(lang);
            trackJob(lang, data.jobId);
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
        reportMessage(
          `Failed: ${failed.map((f) => `${getLanguageLabel(f.lang)} (${f.error})`).join(", ")}`
        );
      } else {
        reportMessage(null);
      }
    } catch {
      reportMessage("Could not start translation. Try again.");
    } finally {
      setTranslating(false);
    }
  }, [bookId, sourceLanguage, sourceVersionId, reportMessage, request, trackJob]);

  // Handle return from Stripe checkout. Runs once per mount via
  // checkoutHandledRef so re-renders from prop changes can't double-fire.
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
  }, [searchParams, sourceVersionId, router, triggerPaidTranslation]);

  const previewAbortRef = useRef<AbortController | null>(null);

  const fetchPreview = useCallback(async () => {
    if (!bookId || !targetLanguage) return;

    // Abort any in-flight preview request to prevent stale responses overwriting state
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;

    setPreviewRequested(true);
    setLoadingPreview(true);
    setTranslationPreview("");
    setPreviewUnavailable(false);
    setPreviewError(null);
    try {
      const res = await request(
        `/api/books/${bookId}/translation-preview?targetLanguage=${encodeURIComponent(targetLanguage)}&sourceVersionId=${encodeURIComponent(sourceVersionId ?? "")}&sourceLanguage=${encodeURIComponent(sourceLanguage)}`,
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
        setPreviewUnavailable(nextPreviewUnavailable || Boolean(data.pairUnsupported));
      } else {
        setTranslationPreview("");
        setPreviewError(res.status === 401 ? "Your session expired. Sign in again to load the preview." : resolveErrorMessage(data?.error, "We couldn’t load the preview. Your manuscript has not changed."));
      }
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      setTranslationPreview("");
      setPreviewError("Couldn’t connect. Check your connection and try the preview again.");
    } finally {
      if (!controller.signal.aborted) {
        setLoadingPreview(false);
      }
    }
  }, [bookId, sourceLanguage, targetLanguage, sourceVersionId, request]);

  useEffect(() => {
    setPreviewRequested(false);
    setOriginalPreview("");
    setTranslationPreview("");
    setPreviewError(null);
    setLoadingPreview(false);
    setPreviewUnavailable(false);
    return () => {
      previewAbortRef.current?.abort();
    };
  }, [fetchPreview]);

  const handleTranslateFullBook = useCallback(async () => {
    if (!bookId || !sourceVersionId || translating || billingLoading) return;
    const toTranslate = Array.from(selectedLanguages).filter((code) =>
      isSupportedLanguage(code) && isTranslationPairSupported(sourceLanguage, code)
    ) as SupportedLanguage[];
    if (toTranslate.length === 0) {
      reportMessage("Select at least one language.");
      return;
    }

    if (isProLocked) {
      setCheckoutLanguages(toTranslate);
      setCheckoutModalOpen(true);
      return;
    }

    setTranslating(true);
    setSuccessMessage(null);
    reportMessage(null);
    try {
      const succeeded: string[] = [];
      const failed: Array<{ lang: string; error: string }> = [];
      for (const lang of toTranslate) {
        try {
          const res = await request(`/api/books/${bookId}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetLanguage: lang,
              sourceLanguage,
              sourceVersionId,
              overwrite: false,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.ok === false) {
            failed.push({ lang, error: resolveErrorMessage(data?.error, "Could not start translation.") });
          } else {
            succeeded.push(lang);
            trackJob(lang, data.jobId);
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
        reportMessage(
          `Failed: ${failed.map((f) => `${getLanguageLabel(f.lang)} (${f.error})`).join(", ")}`
        );
      } else {
        reportMessage(null);
      }
    } catch {
      reportMessage("Could not start translation. Try again.");
    } finally {
      setTranslating(false);
    }
  }, [bookId, sourceVersionId, selectedLanguages, sourceLanguage, translating, billingLoading, isProLocked, reportMessage, request, trackJob]);

  const handleTranslateSingleLanguage = useCallback(async () => {
    if (!bookId || !sourceVersionId || translating || billingLoading || !isSupportedLanguage(targetLanguage)) return;

    if (isProLocked) {
      setCheckoutLanguages([targetLanguage]);
      setCheckoutModalOpen(true);
      return;
    }

    if (translateScope === "chapter" && !selectedChapterId) {
      reportMessage("Select a chapter first.");
      return;
    }

    setTranslating(true);
    setSuccessMessage(null);
    reportMessage(null);
    try {
      const body: Record<string, unknown> = {
        targetLanguage,
        sourceLanguage,
        sourceVersionId,
        overwrite: false,
      };
      if (translateScope === "chapter" && selectedChapterId) {
        body.chapterId = selectedChapterId;
      }
      const res = await request(`/api/books/${bookId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        reportMessage(resolveErrorMessage(data?.error, "Could not start translation."));
        setTranslating(false);
        return;
      }
      trackJob(targetLanguage, data.jobId);
      const scopeLabel = translateScope === "chapter" ? "Chapter translation" : "Translation";
      setSuccessMessage(`${scopeLabel} started. You can keep working while we prepare your translation.`);
      reportMessage(null);
    } catch {
      reportMessage("Could not start translation. Try again.");
    } finally {
      setTranslating(false);
    }
  }, [bookId, sourceLanguage, sourceVersionId, targetLanguage, translating, billingLoading, isProLocked, translateScope, selectedChapterId, reportMessage, request, trackJob]);

  const handleProSubscribe = useCallback(() => {
    setCheckoutModalOpen(false);
    window.location.href = "/author/billing";
  }, []);

  const toggleLanguage = (code: string) => {
    if (translating || !isSupportedLanguage(code) || !isTranslationPairSupported(sourceLanguage, code)) return;
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

  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId);
  const chapterUnavailable = !isProLocked && translateScope === "chapter" && !selectedChapter;
  const actionDisabled = translating || billingLoading || !sourceVersionId || chapterUnavailable;

  return (
    <section className={styles.studio} aria-labelledby="translation-title">
      <header className={styles.intro}>
        <div>
          {!hideTitle && <p className={styles.bookTitle}>{bookTitle} <span>by {authorDisplayName}</span></p>}
          <h2 id="translation-title">Your story, <span>in another language.</span></h2>
          <p>Compare an opening excerpt. Choose what to translate. Keep the final say.</p>
        </div>
        <span className={styles.length}><BookOpen size={16} aria-hidden />{bookLengthLabel.replace(/^1 chapters$/, "1 chapter")}</span>
      </header>

      <SavedTranslationComparison key={`saved:${bookId}:${sourceVersionId}:${targetLanguage}`} bookId={bookId} sourceVersionId={sourceVersionId} targetLanguage={targetLanguage} request={request} />

      <div className={styles.workbench}>
        <div className={styles.toolbar}>
          <div className={styles.languagePair}>
            <div className={styles.source}><span>Translate from</span><strong>{sourceLabel}</strong></div>
            <ArrowRight size={20} className={styles.direction} aria-hidden />
            <label className={styles.target}>
              <span>Translate into</span>
              <div className={styles.selectWrap}>
                <select aria-label="Target language" value={targetLanguage} disabled={translating}
                  onChange={(event) => setTargetLanguage(event.target.value as SupportedLanguage)}>
                  {targetOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <ChevronDown size={16} aria-hidden />
              </div>
            </label>
          </div>
          {!isProLocked && chapters.length > 0 && (
            <div className={styles.scope} aria-label="Translation scope">
              <button type="button" disabled={translating} aria-pressed={translateScope === "book"} onClick={() => setTranslateScope("book")}>Full book</button>
              <button type="button" disabled={translating} aria-pressed={translateScope === "chapter"} onClick={() => setTranslateScope("chapter")}>Current chapter</button>
            </div>
          )}
        </div>
        <div className="px-6 pt-4">
          <p className="text-xs text-muted-foreground">Optional AI opening preview · not yet reviewed. Generating a new preview uses your AI allowance.</p>
          <button type="button" className="mt-3 min-h-11 rounded-full border border-border px-4 text-sm" disabled={loadingPreview || !sourceVersionId} onClick={() => void fetchPreview()}>Generate opening preview</button>
        </div>
        {previewRequested && <TranslatePreviewPanes
          targetLanguage={targetLanguage} loadingPreview={loadingPreview}
          originalPreview={originalPreview} translationPreview={translationPreview}
          previewUnavailable={previewUnavailable} previewError={previewError}
          onRetry={() => void fetchPreview()}
        />}
        <div className={styles.actionBar}>
          <div>
            <p>{translateScope === "chapter" && !isProLocked ? selectedChapter ? selectedChapter.title || "Untitled chapter" : "Select a chapter in Write first" : `Full book → ${getLanguageLabel(targetLanguage)}`}</p>
            <span>{!sourceVersionId ? "Add your manuscript before starting a translation." : billingLoading ? "Checking your plan…" : isProLocked ? "Review payment options before you start." : "Your original stays unchanged. Review the translation before publishing."}</span>
          </div>
          <button type="button" className={styles.primary} disabled={actionDisabled}
            onClick={() => void handleTranslateSingleLanguage()}>
            {translating ? "Starting translation…" : isProLocked ? "View translation options" : translateScope === "chapter" ? "Translate chapter" : "Translate book"}
            <ArrowRight size={17} aria-hidden />
          </button>
        </div>
      </div>

      {(successMessage || actionError) && <div className={styles.feedback}>
        {successMessage && <p role="status"><Check size={18} aria-hidden />{successMessage}</p>}
        {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
      </div>}

      <TranslationQualityCard key={`${bookId}:${sourceVersionId}:${targetLanguage}`} bookId={bookId} sourceVersionId={sourceVersionId} targetLanguage={targetLanguage} request={request} />

      <details className={styles.more}>
        <summary>
          <Languages size={22} aria-hidden />
          <span><strong>Take your book further</strong><span>Translate the full book into several languages in one go.</span></span>
          <ChevronDown className={styles.expandIcon} size={20} aria-hidden />
        </summary>
        <div className={styles.moreBody}>
          <TranslateMoreLanguagesCard sourceLanguage={sourceLanguage} selectedLanguages={selectedLanguages}
            disabled={translating} onToggleLanguage={toggleLanguage} />
          <div className={styles.batchAction}>
            <div><p>{selectedForDisplay.length ? selectedForDisplay.map((language) => language.label).join(", ") : "Choose at least one language"}</p>
              <span>Full book · {selectedForDisplay.length} {selectedForDisplay.length === 1 ? "language" : "languages"}{isProLocked ? " · Payment options shown next" : ""}</span></div>
            <button type="button" className={styles.primary} onClick={() => void handleTranslateFullBook()}
              disabled={translating || billingLoading || !sourceVersionId || !selectedForDisplay.length}>
              {translating ? "Starting translations…" : isProLocked ? "View options for selected languages" : "Translate selected languages"}<ArrowRight size={17} aria-hidden />
            </button>
          </div>
        </div>
      </details>
      <TranslationCheckoutModal open={checkoutModalOpen} onClose={() => setCheckoutModalOpen(false)}
        bookId={bookId} sourceVersionId={sourceVersionId ?? ""} sourceLanguage={sourceLanguage} languages={checkoutLanguages} onProSubscribe={handleProSubscribe} />
    </section>
  );
}
