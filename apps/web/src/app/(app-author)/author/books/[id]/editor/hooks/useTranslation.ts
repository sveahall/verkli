"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { normalizeLanguage, getLanguageLabel, LANGUAGE_OPTIONS, type SupportedLanguage } from "@/lib/languages";
import { resolveErrorMessage } from "@/lib/error-messages";
import { getTranslationsEnabled } from "@/lib/flags";
import { normalizeLangKey, TRANSLATION_POLL_MAX_MS } from "../BookEditorView.helpers";
import type { Book, BookVersion } from "../BookEditorView.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseTranslationOptions {
  book: Book;
  bookVersions: BookVersion[];
  activeVersion: BookVersion | null;
  selectedChapterId: string | null;
  getBookWorkspaceHref: (language?: string | null) => string;
}

export type TranslationUiStatus = "idle" | "translating" | "done" | "error";

export interface UseTranslationReturn {
  // State
  translateTargetLanguage: SupportedLanguage;
  setTranslateTargetLanguage: React.Dispatch<React.SetStateAction<SupportedLanguage>>;
  isStartingTranslation: boolean;
  isPollingTranslation: boolean;
  translateMessage: string | null;
  setTranslateMessage: React.Dispatch<React.SetStateAction<string | null>>;
  translationQueueHealthy: boolean | null;
  lastRequestedTargetLanguage: SupportedLanguage | null;
  setLastRequestedTargetLanguage: React.Dispatch<React.SetStateAction<SupportedLanguage | null>>;
  translationProgress: { translated: number; total: number } | null;

  // Refs (exposed for external retry-job logic)
  translationPollRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  translationPollStartedAtRef: React.MutableRefObject<number>;
  lastRequestedTargetLanguageRef: React.MutableRefObject<SupportedLanguage | null>;
  requestedTargetVersionRef: React.MutableRefObject<BookVersion | null>;
  translationFailedCountRef: React.MutableRefObject<number>;

  // Computed
  existingVersionLanguages: Set<string>;
  initialTargetLanguage: SupportedLanguage;
  translationSourceLang: SupportedLanguage;
  versionsByLang: Map<string, BookVersion>;
  currentTargetVersion: BookVersion | undefined;
  requestedTargetVersion: BookVersion | null;
  translationUiStatus: TranslationUiStatus;
  isPollingCurrent: boolean;

  // Handlers
  checkTranslationQueueHealth: () => Promise<boolean>;
  startTranslationPoll: () => void;
  stopTranslationPoll: () => void;
  handleStartTranslation: (scope?: "book" | "chapter") => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTranslation({
  book,
  bookVersions,
  activeVersion,
  selectedChapterId,
  getBookWorkspaceHref,
}: UseTranslationOptions): UseTranslationReturn {
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // Computed values (derived from props, no effects needed)
  // ---------------------------------------------------------------------------

  const existingVersionLanguages = useMemo(() => {
    const langs = new Set<string>();
    for (const v of bookVersions) {
      const key = normalizeLangKey(v.language_code);
      if (key) langs.add(key);
    }
    return langs;
  }, [bookVersions]);

  const initialTargetLanguage = useMemo<SupportedLanguage>(() => {
    const currentLang = normalizeLanguage(activeVersion?.language_code ?? book.original_language ?? book.language);
    const preferred = currentLang === "en" ? "sv" : "en";
    if (!existingVersionLanguages.has(preferred)) return preferred;
    for (const opt of LANGUAGE_OPTIONS) {
      if (!existingVersionLanguages.has(opt.value)) return opt.value;
    }
    return preferred;
  }, [activeVersion?.language_code, book.original_language, book.language, existingVersionLanguages]);

  const translationSourceLang = useMemo(
    () => normalizeLanguage(activeVersion?.language_code ?? book.original_language ?? book.language),
    [activeVersion?.language_code, book.original_language, book.language],
  );

  const versionsByLang = useMemo(() => {
    const map = new Map<string, BookVersion>();
    for (const v of bookVersions) {
      const key = normalizeLangKey(v.language_code);
      if (!key) continue;
      map.set(key, v);
    }
    return map;
  }, [bookVersions]);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [translateTargetLanguage, setTranslateTargetLanguage] = useState<SupportedLanguage>(initialTargetLanguage);
  const [isStartingTranslation, setIsStartingTranslation] = useState(false);
  const [isPollingTranslation, setIsPollingTranslation] = useState(false);
  const [translateMessage, setTranslateMessage] = useState<string | null>(null);
  const [translationQueueHealthy, setTranslationQueueHealthy] = useState<boolean | null>(null);
  const [lastRequestedTargetLanguage, setLastRequestedTargetLanguage] = useState<SupportedLanguage | null>(null);
  const [translationProgress, setTranslationProgress] = useState<{ translated: number; total: number } | null>(null);

  // ---------------------------------------------------------------------------
  // Refs
  // ---------------------------------------------------------------------------

  const translationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const translationPollStartedAtRef = useRef<number>(0);
  const lastRequestedTargetLanguageRef = useRef<SupportedLanguage | null>(null);
  const requestedTargetVersionRef = useRef<BookVersion | null>(null);
  const translationFailedCountRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Derived computed values (depend on state)
  // ---------------------------------------------------------------------------

  const currentTargetVersion = useMemo(
    () => versionsByLang.get(normalizeLangKey(translateTargetLanguage)),
    [versionsByLang, translateTargetLanguage],
  );

  const requestedTargetVersion = useMemo(
    () => (lastRequestedTargetLanguage ? versionsByLang.get(normalizeLangKey(lastRequestedTargetLanguage)) ?? null : null),
    [versionsByLang, lastRequestedTargetLanguage],
  );

  const isPollingCurrent = isPollingTranslation && lastRequestedTargetLanguage === translateTargetLanguage;

  const translationUiStatus = useMemo<TranslationUiStatus>(() => {
    if (currentTargetVersion?.status === "failed") return "error";
    if (currentTargetVersion?.status === "translating" || isPollingCurrent) return "translating";
    if (currentTargetVersion?.status === "done" || currentTargetVersion?.published_at) return "done";
    return "idle";
  }, [currentTargetVersion?.status, currentTargetVersion?.published_at, isPollingCurrent]);

  // ---------------------------------------------------------------------------
  // Ref sync effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    requestedTargetVersionRef.current = requestedTargetVersion ?? null;
  }, [requestedTargetVersion]);

  useEffect(() => {
    lastRequestedTargetLanguageRef.current = lastRequestedTargetLanguage;
  }, [lastRequestedTargetLanguage]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const stopTranslationPoll = useCallback(() => {
    if (translationPollRef.current) {
      clearInterval(translationPollRef.current);
      translationPollRef.current = null;
    }
    setIsPollingTranslation(false);
  }, []);

  const checkTranslationQueueHealth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/translation/availability", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && data?.available === true;
      setTranslationQueueHealthy(ok);
      return ok;
    } catch {
      setTranslationQueueHealthy(false);
      return false;
    }
  }, []);

  const startTranslationPoll = useCallback(() => {
    stopTranslationPoll();
    translationFailedCountRef.current = 0;
    translationPollStartedAtRef.current = Date.now();
    setIsPollingTranslation(true);
    translationPollRef.current = setInterval(() => {
      const info = requestedTargetVersionRef.current;
      const status = info?.status ?? "none";
      const elapsed = Date.now() - translationPollStartedAtRef.current;
      if (elapsed >= TRANSLATION_POLL_MAX_MS && status === "none") {
        stopTranslationPoll();
        setTranslationProgress(null);
        setTranslateMessage("Translation is taking too long. Try again.");
        setLastRequestedTargetLanguage(null);
        return;
      }
      router.refresh();
      const lang = lastRequestedTargetLanguageRef.current;
      if (lang && book.id) {
        fetch(`/api/books/${book.id}/translation-progress?targetLanguage=${encodeURIComponent(lang)}`, {
          cache: "no-store",
        })
          .then((r) => r.json())
          .then((data: { translated?: number; total?: number }) => {
            const total = typeof data.total === "number" ? data.total : 0;
            const translated = typeof data.translated === "number" ? data.translated : 0;
            if (total > 0) setTranslationProgress({ translated, total });
          })
          .catch(() => {});
      }
    }, 3000);
  }, [router, stopTranslationPoll, book.id]);

  const handleStartTranslation = useCallback(
    async (scope: "book" | "chapter" = "book") => {
      if (isStartingTranslation) return;
      setIsStartingTranslation(true);
      setTranslateMessage(null);

      const queueHealthy = await checkTranslationQueueHealth();
      if (!queueHealthy) {
        setTranslateMessage("Translation service is temporarily unavailable. Try again soon.");
        setIsStartingTranslation(false);
        return;
      }

      if (!activeVersion?.id) {
        setTranslateMessage("No active version found.");
        setIsStartingTranslation(false);
        return;
      }

      if (scope === "chapter" && !selectedChapterId) {
        setTranslateMessage("Select a chapter first.");
        setIsStartingTranslation(false);
        return;
      }

      const existingVersion = versionsByLang.get(normalizeLangKey(translateTargetLanguage));
      if (existingVersion?.status === "translating") {
        setTranslateMessage("Translation is already running. Waiting for completion...");
        setLastRequestedTargetLanguage(translateTargetLanguage);
        startTranslationPoll();
        setIsStartingTranslation(false);
        return;
      }

      let overwrite = false;
      let targetVersionId: string | null = null;
      if (existingVersion && scope === "book") {
        // Failed version: allow one-click retry without confirm
        if (existingVersion.status === "failed") {
          overwrite = true;
          targetVersionId = existingVersion.id;
        } else {
          const shouldOverwrite = window.confirm(
            `A ${getLanguageLabel(translateTargetLanguage)} version already exists. Do you want to overwrite it?`
          );
          if (!shouldOverwrite) {
            router.push(getBookWorkspaceHref(translateTargetLanguage));
            setIsStartingTranslation(false);
            return;
          }
          overwrite = true;
          targetVersionId = existingVersion.id;
        }
      }

      try {
        const res = await fetch(`/api/books/${book.id}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetLanguage: translateTargetLanguage,
            sourceVersionId: activeVersion.id,
            targetVersionId,
            overwrite,
            chapterId: scope === "chapter" ? selectedChapterId : null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          if (data?.existingVersionId) {
            setTranslateMessage("Version already exists. Opening existing version...");
            router.push(getBookWorkspaceHref(translateTargetLanguage));
            return;
          }
          setTranslateMessage(resolveErrorMessage(data?.error));
          return;
        }
        setTranslateMessage(
          scope === "chapter"
            ? "Chapter translation started. Waiting for completion..."
            : "Translation started. Waiting for completion..."
        );
        setLastRequestedTargetLanguage(translateTargetLanguage);
        startTranslationPoll();
      } catch {
        setTranslateMessage("Could not start translation. Try again.");
      } finally {
        setIsStartingTranslation(false);
      }
    },
    [
      checkTranslationQueueHealth,
      isStartingTranslation,
      startTranslationPoll,
      translateTargetLanguage,
      activeVersion?.id,
      selectedChapterId,
      versionsByLang,
      book.id,
      getBookWorkspaceHref,
      router,
    ],
  );

  // ---------------------------------------------------------------------------
  // Effects — translation polling status watcher
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isPollingTranslation || !lastRequestedTargetLanguage) return;
    if (requestedTargetVersion?.status === "done" || requestedTargetVersion?.published_at) {
      translationFailedCountRef.current = 0;
      stopTranslationPoll();
      setTranslationProgress(null);
      setTranslateMessage(`Translation complete (${getLanguageLabel(lastRequestedTargetLanguage)}).`);
      setLastRequestedTargetLanguage(null);
      return;
    }
    if (requestedTargetVersion?.status === "translating") {
      translationFailedCountRef.current = 0;
      return;
    }
    if (requestedTargetVersion?.status === "failed") {
      translationFailedCountRef.current += 1;
      // Only treat as terminal after 2 consecutive "failed" (avoids race: worker may not have set "translating" yet)
      if (translationFailedCountRef.current >= 2) {
        stopTranslationPoll();
        setTranslationProgress(null);
        setTranslateMessage(
          (requestedTargetVersion as BookVersion).error_message?.trim() ||
            "Translation failed. Try again."
        );
        setLastRequestedTargetLanguage(null);
      }
    }
  }, [isPollingTranslation, lastRequestedTargetLanguage, requestedTargetVersion, stopTranslationPoll]);

  // ---------------------------------------------------------------------------
  // Effect — cleanup poll on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      stopTranslationPoll();
    };
  }, [stopTranslationPoll]);

  // ---------------------------------------------------------------------------
  // Effect — reset translateMessage when target language changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setTranslateMessage(null);
  }, [translateTargetLanguage]);

  // ---------------------------------------------------------------------------
  // Effect — clear progress when not translating
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isPollingTranslation && translationUiStatus !== "translating") {
      setTranslationProgress(null);
    }
  }, [isPollingTranslation, translationUiStatus]);

  // ---------------------------------------------------------------------------
  // Effect — fetch progress on page refresh (translating but not polling)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (translationUiStatus !== "translating" || isPollingTranslation || !translateTargetLanguage || !book.id) return;
    const tick = () => {
      fetch(
        `/api/books/${book.id}/translation-progress?targetLanguage=${encodeURIComponent(translateTargetLanguage)}`,
        { cache: "no-store" }
      )
        .then((r) => r.json())
        .then((data: { translated?: number; total?: number }) => {
          const total = typeof data.total === "number" ? data.total : 0;
          const translated = typeof data.translated === "number" ? data.translated : 0;
          if (total > 0) setTranslationProgress({ translated, total });
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [translationUiStatus, isPollingTranslation, translateTargetLanguage, book.id]);

  // ---------------------------------------------------------------------------
  // Effect — translation queue health check on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!getTranslationsEnabled()) return;
    void checkTranslationQueueHealth();
  }, [checkTranslationQueueHealth]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // State
    translateTargetLanguage,
    setTranslateTargetLanguage,
    isStartingTranslation,
    isPollingTranslation,
    translateMessage,
    setTranslateMessage,
    translationQueueHealthy,
    lastRequestedTargetLanguage,
    setLastRequestedTargetLanguage,
    translationProgress,

    // Refs
    translationPollRef,
    translationPollStartedAtRef,
    lastRequestedTargetLanguageRef,
    requestedTargetVersionRef,
    translationFailedCountRef,

    // Computed
    existingVersionLanguages,
    initialTargetLanguage,
    translationSourceLang,
    versionsByLang,
    currentTargetVersion,
    requestedTargetVersion,
    translationUiStatus,
    isPollingCurrent,

    // Handlers
    checkTranslationQueueHealth,
    startTranslationPoll,
    stopTranslationPoll,
    handleStartTranslation,
  };
}
