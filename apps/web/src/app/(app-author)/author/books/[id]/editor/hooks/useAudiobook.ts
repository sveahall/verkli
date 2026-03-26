"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAudiobookEnabled } from "@/lib/flags";
import { isJobActiveStatus, normalizeJobStatus } from "@/lib/job-status";
import { normalizeLanguage } from "@/lib/languages";
import { resolveErrorMessage } from "@/lib/error-messages";
import { type UnifiedJob } from "@/hooks/useBookJobs";
import {
  formatAudiobookEta,
  normalizeLangKey,
} from "../BookEditorView.helpers";
import {
  type AudiobookControlAction,
  type AudiobookGenerationScope,
  type Book,
  type BookVersion,
  type Chapter,
  type LatestAudiobookAsset,
} from "../BookEditorView.types";

// ── Progress type ──────────────────────────────────────────────────────────────

export type AudiobookProgress = {
  totalChapters: number;
  completedChapters: number;
  currentChapterTitle: string | null;
  estimatedSecondsRemaining: number | null;
};

// ── Options ────────────────────────────────────────────────────────────────────

export interface UseAudiobookOptions {
  book: Book;
  chapters: Chapter[];
  activeVersion: BookVersion | null;
  activeLanguage: string;
  selectedChapterId: string | null;
  totalBookWordCount: number;
  latestAudiobookAsset: LatestAudiobookAsset;
  billing: { loading: boolean; isProActive: boolean; pastDue: boolean };
  allJobs: UnifiedJob[];
  refetchBookJob: () => Promise<void>;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useAudiobook({
  book,
  chapters,
  activeVersion,
  activeLanguage,
  selectedChapterId,
  // totalBookWordCount is accepted for interface contract but not used internally at this time
  totalBookWordCount: _totalBookWordCount,
  latestAudiobookAsset,
  billing,
  allJobs,
  refetchBookJob,
}: UseAudiobookOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── State ──────────────────────────────────────────────────────────────────

  const [isGeneratingAudiobook, setIsGeneratingAudiobook] = useState(false);
  const [audiobookError, setAudiobookError] = useState<string | null>(null);
  const [audiobookProgress, setAudiobookProgress] = useState<AudiobookProgress | null>(null);
  const [audiobookScope, setAudiobookScope] = useState<AudiobookGenerationScope>("book");
  const [audiobookSelectedChapterIds, setAudiobookSelectedChapterIds] = useState<string[]>([]);
  const [isAudiobookChapterPickerOpen, setIsAudiobookChapterPickerOpen] = useState(false);
  const [audiobookControlPending, setAudiobookControlPending] = useState<AudiobookControlAction | null>(null);
  const [audiobookCheckoutModalOpen, setAudiobookCheckoutModalOpen] = useState(false);
  const [audiobookCheckoutLoading, setAudiobookCheckoutLoading] = useState(false);
  const [audiobookPreviewVoice, setAudiobookPreviewVoice] = useState("Ryan");
  const [audiobookPreviewTone, setAudiobookPreviewTone] = useState("neutral");
  const [audiobookSelectedLanguages, setAudiobookSelectedLanguages] = useState<string[]>(() => {
    const lang = normalizeLanguage(book.language ?? book.original_language);
    return [lang];
  });
  const [abLangOpen, setAbLangOpen] = useState(false);
  const [abVoiceOpen, setAbVoiceOpen] = useState(false);
  const [abToneOpen, setAbToneOpen] = useState(false);
  const [audiobookPreviewPlaying, setAudiobookPreviewPlaying] = useState(false);
  const [audiobookPreviewCurrentTime, setAudiobookPreviewCurrentTime] = useState(0);
  const [audiobookPreviewDuration, setAudiobookPreviewDuration] = useState(0);
  const [audiobookPreviewSpeed, setAudiobookPreviewSpeed] = useState(1.0);

  // ── Refs ───────────────────────────────────────────────────────────────────

  const audiobookPreviewRef = useRef<HTMLAudioElement>(null);
  const abLangRef = useRef<HTMLDivElement>(null);
  const abVoiceRef = useRef<HTMLDivElement>(null);
  const abToneRef = useRef<HTMLDivElement>(null);
  const audiobookCheckoutHandledRef = useRef(false);

  // ── Computed: latest job & status ──────────────────────────────────────────

  const latestAudiobookJob = useMemo(
    () => (getAudiobookEnabled() ? allJobs.find((j) => j.kind === "audiobook") ?? null : null),
    [allJobs]
  );

  const audiobookJobStatus = latestAudiobookJob ? normalizeJobStatus(latestAudiobookJob.status) : null;

  const STALE_ACTIVE_MS = 30 * 60 * 1000; // 30 min — matches server-side & getVisibleJobs

  const isAudiobookJobStale = (() => {
    if (!latestAudiobookJob || !isJobActiveStatus(audiobookJobStatus)) return false;
    const created = latestAudiobookJob.createdAt ? new Date(latestAudiobookJob.createdAt).getTime() : 0;
    if (created <= 0) return false;
    if (Date.now() - created <= STALE_ACTIVE_MS) return false;
    // Allow paused / cancel-requested jobs to stay active
    const meta = (latestAudiobookJob.meta ?? {}) as Record<string, unknown>;
    const cs = typeof meta.controlState === "string" ? meta.controlState : null;
    if (cs === "paused" || cs === "pause_requested" || cs === "cancel_requested") return false;
    if (meta.cancelRequested === true) return false;
    return true;
  })();

  const isAudiobookJobActive =
    !isAudiobookJobStale &&
    (audiobookJobStatus === "running" || audiobookJobStatus === "pending");

  const isAudiobookJobFailed = normalizeJobStatus(latestAudiobookJob?.status) === "failed";

  const isAudiobookActive = isGeneratingAudiobook || !!isAudiobookJobActive;

  const serverAudiobookProgress = useMemo(() => {
    if (!latestAudiobookJob || !isJobActiveStatus(latestAudiobookJob.status)) return null;
    const meta = latestAudiobookJob.meta as Record<string, unknown>;
    return {
      totalChapters: (meta.totalChapters as number) ?? 0,
      completedChapters: (meta.completedChapters as number) ?? 0,
      currentChapterTitle: (meta.currentChapterTitle as string) ?? null,
      estimatedSecondsRemaining: (meta.estimatedSecondsRemaining as number) ?? null,
    };
  }, [latestAudiobookJob]);

  const effectiveAudiobookProgress = audiobookProgress ?? serverAudiobookProgress;

  const audiobookEtaText = formatAudiobookEta(effectiveAudiobookProgress?.estimatedSecondsRemaining);

  const effectiveAudiobookError = audiobookError ?? (isAudiobookJobFailed ? (latestAudiobookJob?.error ?? null) : null);

  // ── Computed: audiobook meta ───────────────────────────────────────────────

  const hasGeneratedAudiobookAsset = latestAudiobookAsset?.status === "generated";

  const latestAudiobookMeta = (latestAudiobookJob?.meta ?? {}) as Record<string, unknown>;

  const latestAudiobookScope =
    typeof latestAudiobookMeta.scope === "string" ? latestAudiobookMeta.scope : "book";

  const latestAudiobookControlState =
    typeof latestAudiobookMeta.controlState === "string" ? latestAudiobookMeta.controlState : null;

  const latestAudiobookPauseRequested = latestAudiobookMeta.pauseRequested === true;

  const latestAudiobookCancelRequested = latestAudiobookMeta.cancelRequested === true;

  const latestAudiobookManifestUrl =
    typeof latestAudiobookMeta.manifestUrl === "string" && latestAudiobookMeta.manifestUrl.trim().length > 0
      ? latestAudiobookMeta.manifestUrl.trim()
      : null;

  const latestAudiobookAudioUrl =
    typeof latestAudiobookMeta.audioUrl === "string" && latestAudiobookMeta.audioUrl.trim().length > 0
      ? latestAudiobookMeta.audioUrl.trim()
      : null;

  const latestAudiobookGeneratedChapterAudioUrl =
    typeof latestAudiobookMeta.generatedChapterAudioUrl === "string" &&
    latestAudiobookMeta.generatedChapterAudioUrl.trim().length > 0
      ? latestAudiobookMeta.generatedChapterAudioUrl.trim()
      : null;

  const latestAudiobookAssetAudioUrl =
    typeof latestAudiobookAsset?.audioSignedUrl === "string" && latestAudiobookAsset.audioSignedUrl.trim().length > 0
      ? latestAudiobookAsset.audioSignedUrl.trim()
      : null;

  const fallbackGeneratedAudiobookUrl =
    latestAudiobookGeneratedChapterAudioUrl ?? latestAudiobookAudioUrl ?? latestAudiobookAssetAudioUrl;

  const latestAudiobookChapterIds =
    Array.isArray(latestAudiobookMeta.chapterIds) && latestAudiobookMeta.chapterIds.every((id: unknown) => typeof id === "string")
      ? (latestAudiobookMeta.chapterIds as string[])
      : [];

  const hasCompletedAudiobookJob =
    normalizeJobStatus(latestAudiobookJob?.status) === "completed" && latestAudiobookScope !== "chapter";

  const hasCompletedChapterAudiobookJob =
    normalizeJobStatus(latestAudiobookJob?.status) === "completed" && latestAudiobookScope === "chapter";

  const hasFailedAudiobookJob = normalizeJobStatus(latestAudiobookJob?.status) === "failed";

  const audiobookFeatureEnabled = getAudiobookEnabled();

  const isAudiobookPaused = latestAudiobookControlState === "paused" || latestAudiobookControlState === "pause_requested";

  const isAudiobookCancelRequested = latestAudiobookControlState === "cancel_requested" || latestAudiobookCancelRequested;

  const isAudiobookCancelled = latestAudiobookControlState === "cancelled";

  // Job table is source of truth: no job -> idle. Do not derive failure from worker availability.
  const audiobookStatusUi = !audiobookFeatureEnabled
    ? "disabled"
    : isAudiobookActive
      ? isAudiobookCancelRequested
        ? "cancel_requested"
        : isAudiobookPaused || latestAudiobookPauseRequested
          ? latestAudiobookControlState === "pause_requested" || latestAudiobookPauseRequested
            ? "pause_requested"
            : "paused"
          : audiobookJobStatus === "pending"
            ? "queued"
            : "generating"
      : hasGeneratedAudiobookAsset || hasCompletedAudiobookJob || hasCompletedChapterAudiobookJob
        ? "published"
        : isAudiobookCancelled
          ? "cancelled"
          : hasFailedAudiobookJob
            ? "failed"
            : !latestAudiobookJob
              ? "idle"
              : (book.audiobook_status ?? "idle");

  const shouldShowGeneratedAudiobookPlayer =
    audiobookFeatureEnabled &&
    !isAudiobookActive &&
    audiobookStatusUi === "published" &&
    (Boolean(fallbackGeneratedAudiobookUrl) || Boolean(latestAudiobookManifestUrl));

  const isProFeatureLocked = billing.loading || !billing.isProActive;

  const proFeatureLockMessage = billing.loading
    ? "Checking subscription..."
    : billing.pastDue
      ? "Your subscription is past_due. Update payment to unlock this feature."
      : "Verkli Pro is required for this feature.";

  // ── Computed: scope & selection ────────────────────────────────────────────

  const audiobookRequestedChapterIds = useMemo(() => {
    if (audiobookScope === "book") return [];
    if (audiobookScope === "current") {
      return selectedChapterId ? [selectedChapterId] : [];
    }
    return Array.from(new Set(audiobookSelectedChapterIds));
  }, [audiobookScope, audiobookSelectedChapterIds, selectedChapterId]);

  const audiobookRequestScope = useMemo<"book" | "chapter" | "chapters">(() => {
    if (audiobookRequestedChapterIds.length === 0) return "book";
    if (audiobookRequestedChapterIds.length === 1) return "chapter";
    return "chapters";
  }, [audiobookRequestedChapterIds]);

  const selectedAudiobookChapters = useMemo(
    () => chapters.filter((chapter) => audiobookRequestedChapterIds.includes(chapter.id)),
    [chapters, audiobookRequestedChapterIds]
  );

  const audiobookSelectionSummary =
    audiobookRequestScope === "book"
      ? "Entire book"
      : audiobookRequestScope === "chapter"
        ? selectedAudiobookChapters[0]?.title ?? "Selected chapter"
        : `${audiobookRequestedChapterIds.length} chapters selected`;

  const canPauseAudiobook =
    isAudiobookActive &&
    audiobookControlPending === null &&
    audiobookStatusUi !== "paused" &&
    audiobookStatusUi !== "pause_requested" &&
    audiobookStatusUi !== "cancel_requested";

  const canResumeAudiobook =
    isAudiobookActive &&
    audiobookControlPending === null &&
    (audiobookStatusUi === "paused" || audiobookStatusUi === "pause_requested");

  const canCancelAudiobook =
    isAudiobookActive &&
    audiobookControlPending === null &&
    audiobookStatusUi !== "cancel_requested";

  const activeAudiobookScopeSummary =
    latestAudiobookScope === "chapter"
      ? (typeof latestAudiobookMeta.currentChapterTitle === "string"
          ? latestAudiobookMeta.currentChapterTitle
          : "Single chapter")
      : latestAudiobookScope === "chapters"
        ? `${Math.max(
            1,
            latestAudiobookChapterIds.length ||
              (effectiveAudiobookProgress?.totalChapters ?? 0)
          )} selected chapters`
        : "Entire book";

  // ── Effect: sync audiobook state from latestAudiobookJob ───────────────────

  useEffect(() => {
    if (!audiobookFeatureEnabled || !latestAudiobookJob) return;
    const normalizedStatus = normalizeJobStatus(latestAudiobookJob.status);
    const meta = latestAudiobookJob.meta as Record<string, unknown>;
    const controlState = typeof meta.controlState === "string" ? meta.controlState : null;

    if (isJobActiveStatus(normalizedStatus) && !isAudiobookJobStale) {
      setIsGeneratingAudiobook(true);
      setAudiobookError(null);
      setAudiobookProgress({
        totalChapters: (meta.totalChapters as number) ?? 0,
        completedChapters: (meta.completedChapters as number) ?? 0,
        currentChapterTitle: (meta.currentChapterTitle as string) ?? null,
        estimatedSecondsRemaining: (meta.estimatedSecondsRemaining as number) ?? null,
      });
      return;
    }

    setIsGeneratingAudiobook(false);
    if (isAudiobookJobStale) {
      setAudiobookError("The task appears stuck. Try again.");
      return;
    }
    if (normalizedStatus === "failed") {
      if (controlState === "cancelled") {
        setAudiobookError("Generation cancelled.");
      } else {
        setAudiobookError(latestAudiobookJob.error ?? "Generation could not be completed. Try again.");
      }
      return;
    }
    if (normalizedStatus === "completed") {
      setAudiobookError(null);
    }
  }, [audiobookFeatureEnabled, isAudiobookJobStale, latestAudiobookJob]);

  // ── Effect: close audiobook preview dropdowns on outside click ─────────────

  useEffect(() => {
    if (!abLangOpen && !abVoiceOpen && !abToneOpen) return;
    function handleClick(e: MouseEvent) {
      if (abLangOpen && abLangRef.current && !abLangRef.current.contains(e.target as Node)) setAbLangOpen(false);
      if (abVoiceOpen && abVoiceRef.current && !abVoiceRef.current.contains(e.target as Node)) setAbVoiceOpen(false);
      if (abToneOpen && abToneRef.current && !abToneRef.current.contains(e.target as Node)) setAbToneOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [abLangOpen, abVoiceOpen, abToneOpen]);

  // ── Effect: audiobook scope syncing with selectedChapterId ─────────────────

  useEffect(() => {
    if (audiobookScope === "current") {
      if (selectedChapterId) {
        setAudiobookSelectedChapterIds([selectedChapterId]);
      } else {
        setAudiobookSelectedChapterIds([]);
      }
      return;
    }

    if (audiobookScope === "selected" && audiobookSelectedChapterIds.length === 0 && selectedChapterId) {
      setAudiobookSelectedChapterIds([selectedChapterId]);
    }
  }, [audiobookScope, audiobookSelectedChapterIds.length, selectedChapterId]);

  // ── Effect: prune stale chapter ids when chapters change ───────────────────

  useEffect(() => {
    setAudiobookSelectedChapterIds((prev) => prev.filter((chapterId) => chapters.some((chapter) => chapter.id === chapterId)));
  }, [chapters]);

  // ── Effect: audiobook checkout redirect from search params ─────────────────

  useEffect(() => {
    if (audiobookCheckoutHandledRef.current) return;
    const checkoutStatus = searchParams?.get("audiobook_checkout");
    const sessionId = searchParams?.get("session_id");
    const lang = searchParams?.get("lang");
    if (checkoutStatus === "success" && sessionId && lang) {
      audiobookCheckoutHandledRef.current = true;
      const url = new URL(window.location.href);
      url.searchParams.delete("audiobook_checkout");
      url.searchParams.delete("session_id");
      url.searchParams.delete("lang");
      router.replace(url.pathname + url.search, { scroll: false });
      // Trigger audiobook generation with paid session
      void (async () => {
        setIsGeneratingAudiobook(true);
        setAudiobookError(null);
        try {
          const params = new URLSearchParams();
          params.set("lang", lang);
          const res = await fetch(`/api/books/${book.id}/audiobook/generate?${params.toString()}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope: "book", stripeSessionId: sessionId }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setAudiobookError(resolveErrorMessage(data.error));
            setIsGeneratingAudiobook(false);
            return;
          }
          setAudiobookProgress({
            totalChapters: data.totalChapters ?? 0,
            completedChapters: 0,
            currentChapterTitle: null,
            estimatedSecondsRemaining: null,
          });
          await refetchBookJob();
        } catch {
          setAudiobookError("Could not start generation. Try again.");
          setIsGeneratingAudiobook(false);
        }
      })();
    }
  }, [searchParams, book.id, refetchBookJob, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleGenerateAudiobook = useCallback(
    async () => {
    if (isGeneratingAudiobook || !audiobookFeatureEnabled) return;

    // Non-Pro: show payment modal (force full book)
    if (isProFeatureLocked) {
      setAudiobookCheckoutModalOpen(true);
      return;
    }

    if (audiobookScope !== "book" && audiobookRequestedChapterIds.length === 0) {
      setAudiobookError("Select chapter(s) first.");
      return;
    }
    setAudiobookError(null);
    setAudiobookProgress(null);
    setIsGeneratingAudiobook(true);
    try {
      const langKey = normalizeLangKey(activeVersion?.language_code ?? activeLanguage);
      const params = new URLSearchParams();
      if (langKey) params.set("lang", langKey);
      const endpoint = `/api/books/${book.id}/audiobook/generate${params.size ? `?${params.toString()}` : ""}`;
      const body =
        audiobookRequestScope === "book"
          ? { scope: "book" as const }
          : {
              scope: audiobookRequestScope,
              chapterIds: audiobookRequestedChapterIds,
            };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAudiobookError(resolveErrorMessage(data.error));
        setIsGeneratingAudiobook(false);
        return;
      }
      // Set initial progress while unified jobs endpoint catches up.
      setAudiobookProgress({
        totalChapters: data.totalChapters ?? 0,
        completedChapters: 0,
        currentChapterTitle: null,
        estimatedSecondsRemaining: null,
      });
      await refetchBookJob();
    } catch {
      setAudiobookError(
        audiobookRequestScope === "book"
          ? "Could not start generation. Try again."
          : "Could not start selected chapter generation. Try again."
      );
      setIsGeneratingAudiobook(false);
    }
  }, [
    activeLanguage,
    activeVersion?.language_code,
    audiobookFeatureEnabled,
    audiobookRequestScope,
    audiobookRequestedChapterIds,
    audiobookScope,
    book.id,
    isGeneratingAudiobook,
    isProFeatureLocked,
    refetchBookJob,
  ]);

  const handleAudiobookControl = useCallback(
    async (action: AudiobookControlAction) => {
      if (!audiobookFeatureEnabled || !isAudiobookActive || audiobookControlPending) return;
      setAudiobookError(null);
      setAudiobookControlPending(action);
      try {
        const res = await fetch(`/api/books/${book.id}/audiobook/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAudiobookError(resolveErrorMessage(data?.error));
          return;
        }
        await refetchBookJob();
      } catch {
        setAudiobookError("Could not update generation state. Try again.");
      } finally {
        setAudiobookControlPending(null);
      }
    },
    [audiobookControlPending, audiobookFeatureEnabled, book.id, isAudiobookActive, refetchBookJob]
  );

  const handleAudiobookCheckout = useCallback(async () => {
    if (audiobookCheckoutLoading) return;
    setAudiobookCheckoutLoading(true);
    setAudiobookError(null);
    try {
      const langKey = normalizeLangKey(activeVersion?.language_code ?? activeLanguage);
      const res = await fetch(`/api/books/${book.id}/audiobook/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: langKey || "sv" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setAudiobookError(typeof data.detail === "string" ? data.detail : "Could not start checkout.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setAudiobookError("Could not start checkout. Try again.");
    } finally {
      setAudiobookCheckoutLoading(false);
    }
  }, [audiobookCheckoutLoading, activeVersion?.language_code, activeLanguage, book.id]);

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    // State
    isGeneratingAudiobook,
    setIsGeneratingAudiobook,
    audiobookError,
    setAudiobookError,
    audiobookProgress,
    setAudiobookProgress,
    audiobookScope,
    setAudiobookScope,
    audiobookSelectedChapterIds,
    setAudiobookSelectedChapterIds,
    isAudiobookChapterPickerOpen,
    setIsAudiobookChapterPickerOpen,
    audiobookControlPending,
    setAudiobookControlPending,
    audiobookCheckoutModalOpen,
    setAudiobookCheckoutModalOpen,
    audiobookCheckoutLoading,
    setAudiobookCheckoutLoading,
    audiobookPreviewVoice,
    setAudiobookPreviewVoice,
    audiobookPreviewTone,
    setAudiobookPreviewTone,
    audiobookSelectedLanguages,
    setAudiobookSelectedLanguages,
    abLangOpen,
    setAbLangOpen,
    abVoiceOpen,
    setAbVoiceOpen,
    abToneOpen,
    setAbToneOpen,
    audiobookPreviewPlaying,
    setAudiobookPreviewPlaying,
    audiobookPreviewCurrentTime,
    setAudiobookPreviewCurrentTime,
    audiobookPreviewDuration,
    setAudiobookPreviewDuration,
    audiobookPreviewSpeed,
    setAudiobookPreviewSpeed,

    // Refs
    audiobookPreviewRef,
    abLangRef,
    abVoiceRef,
    abToneRef,
    audiobookCheckoutHandledRef,

    // Computed: job & status
    latestAudiobookJob,
    audiobookJobStatus,
    isAudiobookJobStale,
    isAudiobookJobActive,
    isAudiobookJobFailed,
    isAudiobookActive,
    serverAudiobookProgress,
    effectiveAudiobookProgress,
    audiobookEtaText,
    effectiveAudiobookError,

    // Computed: audiobook meta
    hasGeneratedAudiobookAsset,
    latestAudiobookMeta,
    latestAudiobookScope,
    latestAudiobookControlState,
    latestAudiobookPauseRequested,
    latestAudiobookCancelRequested,
    latestAudiobookManifestUrl,
    latestAudiobookAudioUrl,
    latestAudiobookGeneratedChapterAudioUrl,
    latestAudiobookAssetAudioUrl,
    fallbackGeneratedAudiobookUrl,
    latestAudiobookChapterIds,
    hasCompletedAudiobookJob,
    hasCompletedChapterAudiobookJob,
    hasFailedAudiobookJob,
    audiobookFeatureEnabled,
    isAudiobookPaused,
    isAudiobookCancelRequested,
    isAudiobookCancelled,
    audiobookStatusUi,
    shouldShowGeneratedAudiobookPlayer,
    isProFeatureLocked,
    proFeatureLockMessage,

    // Computed: scope & selection
    audiobookRequestedChapterIds,
    audiobookRequestScope,
    selectedAudiobookChapters,
    audiobookSelectionSummary,
    canPauseAudiobook,
    canResumeAudiobook,
    canCancelAudiobook,
    activeAudiobookScopeSummary,

    // Handlers
    handleGenerateAudiobook,
    handleAudiobookControl,
    handleAudiobookCheckout,
  };
}
