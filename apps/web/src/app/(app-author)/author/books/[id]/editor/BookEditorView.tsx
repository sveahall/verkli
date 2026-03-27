"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BookJobsBanner } from "@/components/books/JobStatusBanner";
import { useToastHelpers } from "@/components/ui/toast";
import { useBookJobs, type UnifiedJob } from "@/hooks/useBookJobs";
import { useBillingState } from "@/hooks/useBillingState";
import { resolveErrorMessage } from "@/lib/error-messages";
import { getAudiobookEnabled, getMarketingEnabled, getRecommendationsEnabled, getTranslationsEnabled } from "@/lib/flags";
import GenreSelector from "@/components/books/GenreSelector";
import { getLanguageLabel, normalizeLanguage, type SupportedLanguage } from "@/lib/languages";
import dynamic from "next/dynamic";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import {
  WRITE_INLINE_AI_EVENT,
  type InlineAiAction,
  type WriteInlineAiEventDetail,
} from "@/features/book-workspace/types";
import BookWorkflowHeader from "../BookWorkflowHeader";
import ImportManusSection from "./components/ImportManusSection";
import { useBookWorkspaceCommandPalette } from "./workspace/BookWorkspaceCommandPaletteProvider";
import { useBookWorkspaceController } from "./hooks/useBookWorkspaceController";
import { useChapterSelection } from "./hooks/useChapterSelection";
import { useBookPricing } from "./hooks/useBookPricing";
import { useBookCover } from "./hooks/useBookCover";
import { useBookRename } from "./hooks/useBookRename";
import { useChapterCrud } from "./hooks/useChapterCrud";
import { usePublishing } from "./hooks/usePublishing";
import { useTranslation } from "./hooks/useTranslation";
import { useAudiobook } from "./hooks/useAudiobook";
import { useMarketing } from "./hooks/useMarketing";
import {
  countWordsInContent,
  normalizeLangKey,
  STORAGE_PRESET,
} from "./BookEditorView.helpers";
import type {
  Book,
  BookVersion,
  Chapter,
  LatestAudiobookAsset,
  MarketingCampaignRow,
  PublishVisibility,
  Tool,
} from "./BookEditorView.types";
import FocusModeEditorView from "./views/FocusModeEditorView";
import SimplifiedEditView from "./views/SimplifiedEditView";
import WriteOnlyWorkspaceView from "./views/WriteOnlyWorkspaceView";
import { normalizePrintOnDemandSettings, type PrintOnDemandSettings } from "./panels/PrintPanel.helpers";

const PrintPanel = dynamic(() => import("./panels/PrintPanel"));
const TranslatePanel = dynamic(() => import("./panels/TranslatePanel"));
const PolishPanel = dynamic(() => import("./panels/PolishPanel"));
const PublishPanel = dynamic(() => import("./panels/PublishPanel"));
const MarketPanel = dynamic(() => import("./panels/MarketPanel"));
const StatisticsPanel = dynamic(() => import("./panels/StatisticsPanel"));
const AudiobookPanel = dynamic(() => import("./panels/AudiobookPanel"));
const CoverPanel = dynamic(() => import("./panels/CoverPanel"));
const PricingPanel = dynamic(() => import("./panels/PricingPanel"));

type Props = {
  book: Book;
  chapters: Chapter[];
  bookVersions: BookVersion[];
  activeVersion: BookVersion | null;
  authorDisplayName?: string;
  defaultPublishVisibility?: PublishVisibility;
  latestAudiobookAsset?: LatestAudiobookAsset;
  marketingCampaigns?: MarketingCampaignRow[];
  stripeConfigured?: boolean;
  /** Limit which tools appear in the sidebar. When set, only these tools are shown. */
  visibleTools?: Tool[];
};

export default function BookEditorView({
  book,
  chapters: initialChapters,
  bookVersions,
  activeVersion,
  authorDisplayName = "Author",
  defaultPublishVisibility = "public",
  latestAudiobookAsset = null,
  marketingCampaigns = [],
  stripeConfigured = false,
  visibleTools,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToastHelpers();
  const {
    setCurrentBookId: setAuthorCurrentBookId,
    setContextPanelState,
    clearContextPanelState,
  } = useAuthorWorkspace();
  const {
    activePanel: tool,
    setActivePanel: setTool,
    focusMode,
    setFocusMode,
    effectiveTools,
  } = useBookWorkspaceController({ bookId: book.id, visibleTools });
  const {
    openPalette,
    setCommands,
  } = useBookWorkspaceCommandPalette();

  // ── Chapters ──────────────────────────────────────────────────────────────
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);

  useEffect(() => {
    setChapters(initialChapters);
  }, [initialChapters]);

  const {
    CHAPTERS_PER_PAGE,
    chapterPage,
    setChapterPage,
    selectedChapterId,
    selectedChapter,
    selectedChapterIndex,
    selectChapter,
    selectNextChapter,
    selectPreviousChapter,
    setSelectedChapterId,
    startIndex,
    totalPages,
    visibleChapters,
  } = useChapterSelection({
    chapters,
    initialSelectedChapterId: initialChapters[0]?.id ?? null,
  });

  // ── Session & word counts ─────────────────────────────────────────────────
  const [sessionStartWords, setSessionStartWords] = useState<number | null>(null);
  const [preset, setPreset] = useState("novel");
  const [wordCount, setWordCount] = useState(0);
  const chapterWordCounts = useMemo(() => {
    return Object.fromEntries(
      chapters.map((chapter) => [chapter.id, countWordsInContent(chapter.content)])
    ) as Record<string, number>;
  }, [chapters]);
  const totalBookWordCount = useMemo(() => {
    return Object.values(chapterWordCounts).reduce((sum, count) => sum + count, 0);
  }, [chapterWordCounts]);
  const sessionWords = sessionStartWords !== null ? Math.max(0, wordCount - sessionStartWords) : 0;

  // ── Book rename ───────────────────────────────────────────────────────────
  const { bookTitle } = useBookRename({ book });

  // ── Cover ─────────────────────────────────────────────────────────────────
  const cover = useBookCover({ book });

  // ── Pricing ───────────────────────────────────────────────────────────────
  const pricing = useBookPricing({ book });

  // ── Publishing ────────────────────────────────────────────────────────────
  const publishing = usePublishing({
    book,
    bookTitle,
    chapters,
    activeVersion,
    displayCoverUrl: cover.displayCoverUrl,
    coverUploading: cover.coverUploading,
    selectedChapter,
    defaultPublishVisibility,
  });

  // ── Jobs & billing ────────────────────────────────────────────────────────
  const { jobs: allJobs, loading: jobLoading, error: jobError, refetch: refetchBookJob, settled: jobsSettled } = useBookJobs(book.id);
  const billing = useBillingState();

  const jobsForBanner = useMemo(
    () => (getAudiobookEnabled() ? allJobs : allJobs.filter((j) => j.kind !== "audiobook")),
    [allJobs]
  );
  const importJobs = useMemo(() => allJobs.filter((j) => j.kind === "import"), [allJobs]);

  // ── Language helpers ──────────────────────────────────────────────────────
  const activeLanguage = normalizeLanguage(
    activeVersion?.language_code ?? book.original_language ?? book.language
  );
  const isWriteOnlyWorkspace = effectiveTools.length === 1 && effectiveTools[0] === "edit";

  // ── Translation ───────────────────────────────────────────────────────────
  const getBookWorkspaceHref = useCallback(
    (language?: string | null) => {
      const normalizedLanguage = language ? normalizeLangKey(language) : null;
      if (isWriteOnlyWorkspace) {
        const params = new URLSearchParams({ bookId: book.id });
        if (normalizedLanguage) params.set("lang", normalizedLanguage);
        return `/author/write?${params.toString()}`;
      }
      return normalizedLanguage
        ? `/author/books/${book.id}?lang=${normalizedLanguage}`
        : `/author/books/${book.id}`;
    },
    [book.id, isWriteOnlyWorkspace]
  );

  const translation = useTranslation({
    book,
    bookVersions,
    activeVersion,
    selectedChapterId,
    getBookWorkspaceHref,
  });

  // ── Audiobook ─────────────────────────────────────────────────────────────
  const audiobook = useAudiobook({
    book,
    chapters,
    activeVersion,
    activeLanguage,
    selectedChapterId,
    totalBookWordCount,
    latestAudiobookAsset,
    billing,
    allJobs,
    refetchBookJob,
  });

  // ── Marketing ─────────────────────────────────────────────────────────────
  const marketing = useMarketing({
    book,
    marketingCampaigns,
    activeVersion,
  });

  // ── Chapter CRUD ──────────────────────────────────────────────────────────
  const chapterCrud = useChapterCrud({
    book,
    activeVersion,
    chapters,
    selectedChapterId,
    setChapters,
    setSelectedChapterId,
    setChapterPage,
    setSessionStartWords,
    chaptersPerPage: CHAPTERS_PER_PAGE,
    getBookWorkspaceHref,
  });

  // ── Print-on-demand ──────────────────────────────────────────────────────
  const [printOnDemandSettings, setPrintOnDemandSettings] = useState<PrintOnDemandSettings>(() =>
    normalizePrintOnDemandSettings(book.print_on_demand_settings)
  );

  // Sync printOnDemandSettings when book prop changes (e.g. after router.refresh)
  const [prevPodProp, setPrevPodProp] = useState(book.print_on_demand_settings);
  if (prevPodProp !== book.print_on_demand_settings) {
    setPrevPodProp(book.print_on_demand_settings);
    setPrintOnDemandSettings(normalizePrintOnDemandSettings(book.print_on_demand_settings));
  }

  const handleSavePrintOnDemandSettings = useCallback(async (nextSettings: PrintOnDemandSettings) => {
    const normalizedSettings = normalizePrintOnDemandSettings(nextSettings);
    const previousSettings = printOnDemandSettings;
    setPrintOnDemandSettings(normalizedSettings);

    const supabase = createClient();
    const { error } = await supabase
      .from("books" as never)
      .update({ print_on_demand_settings: normalizedSettings } as never)
      .eq("id", book.id);

    if (error) {
      setPrintOnDemandSettings(previousSettings);
      const message = "Could not save print on demand settings. Try again.";
      toast.error(message);
      return { ok: false as const, message };
    }

    return { ok: true as const };
  }, [book.id, printOnDemandSettings, toast]);

  // ── Effects: refresh, preset, session words, panel sync ───────────────────
  useEffect(() => {
    if (jobsSettled) router.refresh();
  }, [jobsSettled, router]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_PRESET);
    if (stored && ["novel", "essay", "screenplay"].includes(stored)) setPreset(stored);
  }, []);

  useEffect(() => {
    if (preset) localStorage.setItem(STORAGE_PRESET, preset);
  }, [preset]);

  useEffect(() => {
    if (selectedChapterId && sessionStartWords === null) {
      setSessionStartWords(chapterWordCounts[selectedChapterId] ?? 0);
    }
  }, [chapterWordCounts, selectedChapterId, sessionStartWords]);

  const panelParam = searchParams?.get("panel");

  useEffect(() => {
    const requestedPanel = panelParam?.trim() ?? null;
    if (requestedPanel && effectiveTools.includes(requestedPanel as Tool)) {
      setTool(requestedPanel as Tool);
    } else if (!requestedPanel) {
      setTool("edit");
    }
  }, [effectiveTools, panelParam, setTool]);

  useEffect(() => {
    if (tool === "publish") {
      publishing.setPublishMenuOpen(false);
    }
  }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigateToPanel = useCallback((panel: Tool) => {
    setTool(panel);
    const href = panel === "edit"
      ? `/author/books/${book.id}`
      : `/author/books/${book.id}?panel=${panel}`;
    router.push(href, { scroll: false });
  }, [book.id, router, setTool]);

  const openProductionWorkspace = useCallback(
    (kind: "audiobook" | "translation") => {
      router.push(`/author/production?bookId=${book.id}&kind=${kind}`);
    },
    [book.id, router]
  );

  const openAudienceMarketingWorkspace = useCallback(() => {
    router.push(`/author/audience?bookId=${book.id}&surface=marketing-assets`);
  }, [book.id, router]);

  const openAudiencePublishWorkspace = useCallback(() => {
    router.push(`/author/audience?bookId=${book.id}&surface=beta-readers`);
  }, [book.id, router]);

  const openAnalyticsWorkspace = useCallback(() => {
    router.push(`/author/analytics?bookId=${book.id}`);
  }, [book.id, router]);

  const handleInlineAiAction = useCallback(
    (action: InlineAiAction, selectedText: string) => {
      const detail: WriteInlineAiEventDetail = { action, selectedText };
      window.dispatchEvent(
        new CustomEvent<WriteInlineAiEventDetail>(WRITE_INLINE_AI_EVENT, { detail })
      );
      if (action === "audiobook") openProductionWorkspace("audiobook");
      if (action === "translate") openProductionWorkspace("translation");
    },
    [openProductionWorkspace]
  );

  // ── Write-only workspace context sync ─────────────────────────────────────
  useEffect(() => {
    if (!isWriteOnlyWorkspace) return;
    setAuthorCurrentBookId(book.id);
    setContextPanelState({
      kind: "write",
      payload: {
        bookTitle,
        activeLanguage,
        chapterTitle: selectedChapter?.title ?? null,
        totalBookWordCount,
      },
    });
  }, [
    activeLanguage, book.id, bookTitle, isWriteOnlyWorkspace,
    selectedChapter?.title, setAuthorCurrentBookId, setContextPanelState, totalBookWordCount,
  ]);

  useEffect(() => {
    if (!isWriteOnlyWorkspace) return;
    return () => { clearContextPanelState(); };
  }, [clearContextPanelState, isWriteOnlyWorkspace]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focusMode) {
        e.preventDefault();
        setFocusMode(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        setFocusMode((f) => !f);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setFocusMode((f) => !f);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusMode, setFocusMode]);

  // ── Command palette ───────────────────────────────────────────────────────
  const commands = useMemo(
    () => [
      { id: "focus", label: "Toggle focus mode", shortcut: "⌘\\", group: "Write", onSelect: () => setFocusMode((f) => !f) },
      { id: "new-chapter", label: "New chapter", group: "Write", onSelect: chapterCrud.handleCreateChapter },
      { id: "preset-novel", label: "Preset: Novel", group: "Write", onSelect: () => setPreset("novel") },
      { id: "preset-essay", label: "Preset: Essay", group: "Write", onSelect: () => setPreset("essay") },
      { id: "preset-screenplay", label: "Preset: Screenplay", group: "Write", onSelect: () => setPreset("screenplay") },
      { id: "generate-audiobook", label: "Generate audiobook", group: "Workflow", icon: "audio", keywords: ["production", "voice", "audio"], onSelect: () => openProductionWorkspace("audiobook") },
      { id: "translate-book", label: "Translate book", group: "Workflow", icon: "languages", keywords: ["production", "localize", "translation"], onSelect: () => openProductionWorkspace("translation") },
      { id: "publish-book", label: "Publish book", group: "Workflow", icon: "rocket", keywords: ["audience", "beta readers", "publish"], onSelect: openAudiencePublishWorkspace },
      { id: "create-campaign", label: "Create campaign", group: "Workflow", icon: "megaphone", keywords: ["audience", "marketing", "assets"], onSelect: openAudienceMarketingWorkspace },
      { id: "open-analytics", label: "Open analytics", group: "Workflow", icon: "chart", keywords: ["growth", "engagement", "signals"], onSelect: openAnalyticsWorkspace },
    ],
    [chapterCrud.handleCreateChapter, openAnalyticsWorkspace, openAudienceMarketingWorkspace, openAudiencePublishWorkspace, openProductionWorkspace, setFocusMode]
  );

  useEffect(() => {
    setCommands(commands);
    return () => setCommands([]);
  }, [commands, setCommands]);

  // ── Job retry handler ─────────────────────────────────────────────────────
  const handleJobRetry = useCallback(
    async (job: UnifiedJob) => {
      if (job.kind === "audiobook") {
        audiobook.handleGenerateAudiobook();
        return;
      }

      if (job.kind === "translation") {
        if (!activeVersion?.id) {
          toast.error("No active source version found.");
          return;
        }
        const queueHealthy = await translation.checkTranslationQueueHealth();
        if (!queueHealthy) {
          toast.error("Translation service is temporarily unavailable. Try again soon.");
          return;
        }
        const meta = job.meta as Record<string, unknown>;
        const targetLanguage = normalizeLanguage(
          (job.language ?? (meta.languageCode as string) ?? translation.translateTargetLanguage) as string
        );
        const targetVersionId =
          job.bookVersionId ??
          (typeof meta.bookVersionId === "string" && meta.bookVersionId.trim().length > 0
            ? meta.bookVersionId
            : null);
        try {
          const res = await fetch(`/api/books/${book.id}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetLanguage,
              sourceVersionId: activeVersion.id,
              targetVersionId,
              overwrite: true,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.ok === false) {
            toast.error(resolveErrorMessage(data?.error));
            return;
          }
          translation.setTranslateTargetLanguage(targetLanguage);
          translation.setLastRequestedTargetLanguage(targetLanguage);
          translation.setTranslateMessage(`Translation restarted (${getLanguageLabel(targetLanguage)}).`);
          translation.startTranslationPoll();
          await refetchBookJob();
          toast.success("Translation queued again.");
        } catch {
          toast.error("Could not retry translation.");
        }
        return;
      }

      if (job.kind === "import") {
        try {
          const res = await fetch(`/api/books/imports/${job.id}`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            await refetchBookJob();
            toast.success(data?.message ?? "Import re-queued.");
          } else {
            toast.error(resolveErrorMessage(data?.error));
          }
        } catch {
          toast.error("Could not retry import.");
        }
      }
    },
    [activeVersion?.id, audiobook, book.id, refetchBookJob, toast, translation]
  );

  // ── Layout helpers ────────────────────────────────────────────────────────
  const workspaceContentMaxWidth =
    tool === "edit" || tool === "polish"
      ? "max-w-[940px]"
      : tool === "cover" || tool === "translate" || tool === "audiobook" || tool === "market"
        ? "max-w-[1120px]"
        : "max-w-[1040px]";

  // ── Status banners (shared between views) ─────────────────────────────────
  const jobStatusBanner = jobLoading ? (
    <div
      className="mb-6 flex h-14 items-center rounded-xl border border-black/[0.06] bg-slate-50/50 px-4 dark:border-white/[0.06] dark:bg-white/5"
      role="status"
      aria-label="Loading status"
    >
      <span className="text-sm text-slate-500 dark:text-white/50">Loading status...</span>
    </div>
  ) : jobError ? (
    <div
      className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30"
      role="alert"
    >
      <p className="text-sm text-amber-800 dark:text-amber-200">{jobError}</p>
    </div>
  ) : jobsForBanner.length > 0 ? (
    <div className="mb-6">
      <BookJobsBanner jobs={jobsForBanner} onRetry={handleJobRetry} />
    </div>
  ) : null;

  const billingWarning = billing.pastDue ? (
    <div
      className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/30"
      role="alert"
    >
      <p className="text-sm text-red-800 dark:text-red-200">
        Your subscription is <strong>past_due</strong>. Billing features are locked until payment is updated.{" "}
        <Link href="/author/billing" className="underline">
          Manage subscription
        </Link>
        .
      </p>
    </div>
  ) : null;

  // ═══════════════════════════════════════════════════════════════════════════
  // FOCUS MODE
  // ═══════════════════════════════════════════════════════════════════════════
  if (focusMode) {
    return (
      <FocusModeEditorView
        publishToast={publishing.publishToast}
        topContent={<>{jobStatusBanner}{billingWarning}</>}
        bookTitle={bookTitle}
        authorDisplayName={authorDisplayName}
        bookId={book.id}
        chapters={chapters}
        selectedChapterId={selectedChapterId}
        selectedChapterIndex={selectedChapterIndex}
        selectedChapter={selectedChapter}
        preset={preset}
        onSelectChapter={selectChapter}
        onSelectPreviousChapter={selectPreviousChapter}
        onSelectNextChapter={selectNextChapter}
        onResetSessionWords={() => setSessionStartWords(null)}
        onAutoSave={chapterCrud.handleAutoSave}
        onDirty={() => chapterCrud.setHasUnsavedChanges(true)}
        onWordCount={setWordCount}
        onExitFocusMode={() => setFocusMode(false)}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WRITE-ONLY WORKSPACE
  // ═══════════════════════════════════════════════════════════════════════════
  if (isWriteOnlyWorkspace) {
    return (
      <WriteOnlyWorkspaceView
        publishToast={publishing.publishToast}
        statusContent={<>{jobStatusBanner}{billingWarning}</>}
        bookId={book.id}
        bookTitle={bookTitle}
        tool={tool}
        tools={effectiveTools as Tool[]}
        chapters={chapters}
        wordCount={wordCount}
        displayCoverUrl={cover.displayCoverUrl}
        selectedChapterId={selectedChapterId}
        selectedChapter={selectedChapter}
        editingTitleId={chapterCrud.editingTitleId}
        tempTitle={chapterCrud.tempTitle}
        isSaving={chapterCrud.isSaving}
        saveError={chapterCrud.saveError}
        hasUnsavedChanges={chapterCrud.hasUnsavedChanges}
        lastSaved={chapterCrud.lastSaved}
        sessionWords={sessionWords}
        preset={preset}
        focusMode={focusMode}
        coverUploading={cover.coverUploading}
        coverError={cover.coverError}
        isCreating={chapterCrud.isCreating}
        onSelectChapter={selectChapter}
        onResetSessionWords={() => setSessionStartWords(null)}
        onCreateChapter={chapterCrud.handleCreateChapter}
        onCoverChange={cover.handleCoverChange}
        onMoveChapter={chapterCrud.handleMoveChapter}
        onReorderChapters={chapterCrud.handleReorderChapters}
        onPresetChange={setPreset}
        onFocusModeToggle={() => setFocusMode((current) => !current)}
        onCommandPalette={openPalette}
        onStartEditTitle={chapterCrud.handleStartEditTitle}
        onTempTitleChange={chapterCrud.setTempTitle}
        onSaveTitle={chapterCrud.handleSaveTitle}
        onCancelEditTitle={chapterCrud.handleCancelEditTitle}
        onWordCount={setWordCount}
        onDirty={() => chapterCrud.setHasUnsavedChanges(true)}
        onAutoSave={chapterCrud.handleAutoSave}
        onInlineAiAction={handleInlineAiAction}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN WORKSPACE
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {publishing.publishToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-6 top-24 z-[1000] rounded-full bg-slate-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-lg backdrop-blur-sm dark:bg-white/90 dark:text-slate-900"
        >
          {publishing.publishToast}
        </div>
      )}
      <section className="pb-24">
        <div className="mx-auto max-w-[1200px] space-y-5">
        {jobStatusBanner}
        {billingWarning}

        <BookWorkflowHeader
          bookId={book.id}
          activeTool={tool}
          tools={effectiveTools as Tool[]}
        />

        <div className={`mx-auto ${workspaceContentMaxWidth} min-h-[calc(100vh-14rem)]`}>

        {tool === "pricing" && (
          <PricingPanel
            chapters={chapters}
            priceAmountMinor={pricing.priceAmountMinor}
            setPriceAmountMinor={pricing.setPriceAmountMinor}
            priceCurrency={pricing.priceCurrency}
            setPriceCurrency={pricing.setPriceCurrency}
            pricingModel={pricing.pricingModel}
            setPricingModel={pricing.setPricingModel}
            pricingSaving={pricing.pricingSaving}
            pricingDirty={pricing.pricingDirty}
            pricingError={pricing.pricingError}
            pricingSaved={pricing.pricingSaved}
            handleSavePricing={pricing.handleSavePricing}
            isPublished={publishing.isPublished}
            stripeConfigured={stripeConfigured}
            currentVisibility={publishing.currentVisibility}
          />
        )}

        {tool === "audiobook" && (
          <AudiobookPanel
            bookId={book.id}
            bookLanguage={book.language ?? null}
            bookOriginalLanguage={book.original_language ?? null}
            chapters={chapters}
            selectedChapterId={selectedChapterId}
            activeVersion={activeVersion}
            activeLanguage={activeLanguage}
            totalBookWordCount={totalBookWordCount}
            billingLoading={billing.loading}
            billingIsProActive={billing.isProActive}
            audiobookFeatureEnabled={audiobook.audiobookFeatureEnabled}
            isAudiobookActive={audiobook.isAudiobookActive}
            audiobookStatusUi={audiobook.audiobookStatusUi}
            audiobookError={audiobook.audiobookError}
            effectiveAudiobookProgress={audiobook.effectiveAudiobookProgress}
            effectiveAudiobookError={audiobook.effectiveAudiobookError}
            audiobookEtaText={audiobook.audiobookEtaText}
            audiobookScope={audiobook.audiobookScope}
            setAudiobookScope={audiobook.setAudiobookScope}
            audiobookSelectedChapterIds={audiobook.audiobookSelectedChapterIds}
            setAudiobookSelectedChapterIds={audiobook.setAudiobookSelectedChapterIds}
            isAudiobookChapterPickerOpen={audiobook.isAudiobookChapterPickerOpen}
            setIsAudiobookChapterPickerOpen={audiobook.setIsAudiobookChapterPickerOpen}
            audiobookRequestedChapterIds={audiobook.audiobookRequestedChapterIds}
            audiobookControlPending={audiobook.audiobookControlPending}
            canPauseAudiobook={audiobook.canPauseAudiobook}
            canResumeAudiobook={audiobook.canResumeAudiobook}
            canCancelAudiobook={audiobook.canCancelAudiobook}
            handleAudiobookControl={audiobook.handleAudiobookControl}
            handleGenerateAudiobook={audiobook.handleGenerateAudiobook}
            audiobookSelectedLanguages={audiobook.audiobookSelectedLanguages}
            setAudiobookSelectedLanguages={audiobook.setAudiobookSelectedLanguages}
            audiobookCheckoutModalOpen={audiobook.audiobookCheckoutModalOpen}
            setAudiobookCheckoutModalOpen={audiobook.setAudiobookCheckoutModalOpen}
            audiobookCheckoutLoading={audiobook.audiobookCheckoutLoading}
            handleAudiobookCheckout={audiobook.handleAudiobookCheckout}
            shouldShowGeneratedAudiobookPlayer={audiobook.shouldShowGeneratedAudiobookPlayer}
            fallbackGeneratedAudiobookUrl={audiobook.fallbackGeneratedAudiobookUrl}
            latestAudiobookManifestUrl={audiobook.latestAudiobookManifestUrl}
          />
        )}

        {tool === "print" && (
          <PrintPanel
            bookId={book.id}
            title={bookTitle}
            authorDisplayName={authorDisplayName}
            coverImageUrl={cover.displayCoverUrl}
            originalUrl={book.original_url ?? null}
            chapterCount={chapters.length}
            totalWordCount={totalBookWordCount}
            languageCode={activeLanguage}
            isPublished={publishing.isPublished}
            priceAmountMinor={pricing.priceAmountMinor}
            priceCurrency={pricing.priceCurrency}
            printOnDemandSettings={printOnDemandSettings}
            onOpenEdit={() => navigateToPanel("edit")}
            onOpenCover={() => navigateToPanel("cover")}
            onOpenPublish={() => navigateToPanel("publish")}
            onSavePrintOnDemandSettings={handleSavePrintOnDemandSettings}
          />
        )}

        {tool === "polish" && (
          <PolishPanel
            bookId={book.id}
            chapters={chapters}
            selectedChapterId={selectedChapterId}
            bookVersions={bookVersions}
            activeVersion={activeVersion}
            audiobookStatus={typeof book.audiobook_status === "string" ? book.audiobook_status : null}
            onSelectChapter={(id) => { setSelectedChapterId(id); setSessionStartWords(null); }}
            onOpenEdit={() => navigateToPanel("edit")}
            onOpenTranslate={() => navigateToPanel("translate")}
            onOpenAudiobook={() => navigateToPanel("audiobook")}
          />
        )}

        {tool === "publish" && (
          <PublishPanel
            bookTitle={bookTitle}
            authorDisplayName={authorDisplayName}
            coverImageUrl={cover.displayCoverUrl}
            chapters={chapters}
            selectedChapterId={selectedChapterId}
            bookVersions={bookVersions}
            isPublished={publishing.isPublished}
            publishVisibility={publishing.publishVisibility}
            publishedChapterCount={publishing.publishedChapterCount}
            missingPublishRequirements={publishing.missingPublishRequirements}
            publishDisabled={publishing.publishDisabled}
            chapterPublishDisabled={publishing.chapterPublishDisabled}
            selectedChapterAlreadyPublished={publishing.selectedChapterAlreadyPublished}
            visibilityChanged={publishing.visibilityChanged}
            isPublishing={publishing.isPublishing}
            publishError={publishing.publishError}
            confirmPublishAction={publishing.confirmPublishAction}
            confirmCopy={publishing.confirmCopy}
            onVisibilityChange={(v) => { publishing.setPublishVisibility(v); publishing.setPublishError(null); }}
            onPublishFull={() => publishing.setConfirmPublishAction("publish")}
            onPublishChapter={() => void publishing.handlePublishSelectedChapter()}
            onUpdateSettings={() => publishing.setConfirmPublishAction("update")}
            onUnpublish={() => publishing.setConfirmPublishAction("unpublish")}
            onConfirm={() => publishing.confirmPublishAction && void publishing.handlePublishAction(publishing.confirmPublishAction)}
            onCancelConfirm={() => publishing.setConfirmPublishAction(null)}
            onChapterPublishToggle={(chapter, shouldPublish) => void publishing.handleChapterPublishToggle(chapter, shouldPublish)}
            onSelectChapter={(id) => { setSelectedChapterId(id); setSessionStartWords(null); }}
            onOpenCover={() => navigateToPanel("cover")}
            genreSelector={getRecommendationsEnabled() ? <GenreSelector bookId={book.id} /> : undefined}
          />
        )}

        {tool === "market" && getMarketingEnabled() && (
          <MarketPanel
            bookId={book.id}
            isPublished={publishing.isPublished}
            marketingCampaigns={marketingCampaigns}
            isProLocked={audiobook.isProFeatureLocked}
            proLockMessage={audiobook.proFeatureLockMessage}
            billingLoading={billing.loading}
            onGenerateCopy={async (channel, lang) => {
              if (marketing.isGeneratingMarketing) return;
              marketing.setMarketingChannel(channel);
              marketing.setMarketingLanguage(lang as SupportedLanguage);
              await marketing.handleGenerateMarketingCopy();
            }}
            isGenerating={marketing.isGeneratingMarketing}
          />
        )}

        {tool === "statistics" && (
          <StatisticsPanel
            bookId={book.id}
            isPublished={publishing.isPublished}
          />
        )}

        {tool === "import" && (
          <ImportManusSection
            bookId={book.id}
            bookVersionId={activeVersion?.id ?? null}
            refetchJobs={refetchBookJob}
            importJobs={importJobs}
          />
        )}

        {tool === "cover" && (
          <CoverPanel
            coverInputRef={cover.coverInputRef}
            coverUploading={cover.coverUploading}
            coverError={cover.coverError}
            displayCoverUrl={cover.displayCoverUrl}
            coverDropActive={cover.coverDropActive}
            setCoverDropActive={cover.setCoverDropActive}
            coverAIPrompt={cover.coverAIPrompt}
            setCoverAIPrompt={cover.setCoverAIPrompt}
            coverAIStyle={cover.coverAIStyle}
            setCoverAIStyle={cover.setCoverAIStyle}
            coverAIGeneratedUrls={cover.coverAIGeneratedUrls}
            coverAIGenerating={cover.coverAIGenerating}
            coverAIError={cover.coverAIError}
            setCoverAIError={cover.setCoverAIError}
            coverCropSrc={cover.coverCropSrc}
            setCoverCropSrc={cover.setCoverCropSrc}
            coverAIPreviewUrl={cover.coverAIPreviewUrl}
            setCoverAIPreviewUrl={cover.setCoverAIPreviewUrl}
            handleRemoveCover={cover.handleRemoveCover}
            handleCropSave={cover.handleCropSave}
            handleCoverChange={cover.handleCoverChange}
            handleCoverDrop={cover.handleCoverDrop}
            handleCoverAIGenerate={cover.handleCoverAIGenerate}
            handleCoverSetFromGenerated={cover.handleCoverSetFromGenerated}
          />
        )}

        {tool === "edit" && (
          <SimplifiedEditView
            bookId={book.id}
            bookTitle={bookTitle}
            chapters={chapters}
            visibleChapters={visibleChapters}
            startIndex={startIndex}
            totalPages={totalPages}
            chapterPage={chapterPage}
            selectedChapterId={selectedChapterId}
            selectedChapter={selectedChapter}
            wordCount={wordCount}
            isSaving={chapterCrud.isSaving}
            hasUnsavedChanges={chapterCrud.hasUnsavedChanges}
            lastSaved={chapterCrud.lastSaved}
            preset={preset}
            focusMode={focusMode}
            isPublished={publishing.isPublished}
            onSetChapterPage={setChapterPage}
            onSelectChapter={selectChapter}
            onResetSessionWords={() => setSessionStartWords(null)}
            onWordCount={setWordCount}
            onAutoSave={chapterCrud.handleAutoSave}
            onDirty={() => chapterCrud.setHasUnsavedChanges(true)}
            onToggleFocusMode={() => setFocusMode((current) => !current)}
          />
        )}

        {tool === "translate" && getTranslationsEnabled() && (
          <TranslatePanel
            bookId={book.id}
            bookTitle={bookTitle}
            authorDisplayName={authorDisplayName}
            bookLengthLabel={`${chapters.length} chapters`}
            sourceLanguage={translation.translationSourceLang}
            sourceVersionId={activeVersion?.id ?? null}
            isProLocked={!billing.isProActive}
            billingLoading={billing.loading}
            chapters={chapters.map((ch) => ({ id: ch.id, title: ch.title }))}
            selectedChapterId={selectedChapterId}
            onMessage={translation.setTranslateMessage}
            hideTitle
          />
        )}

        </div>
        </div>
      </section>
    </>
  );
}
