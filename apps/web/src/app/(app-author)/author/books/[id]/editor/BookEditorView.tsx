"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBookJobs } from "@/hooks/useBookJobs";
import { useBillingState } from "@/hooks/useBillingState";
import { getAudiobookEnabled } from "@/lib/flags";
import { normalizeLanguage } from "@/lib/languages";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
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
import { useBookPrintOnDemand } from "./hooks/useBookPrintOnDemand";
import { useJobRetry } from "./hooks/useJobRetry";
import { useBookEditorNavigation } from "./hooks/useBookEditorNavigation";
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
import BookEditorPanelContent from "./BookEditorPanelContent";
import { BookEditorStatusBanners } from "./components/BookEditorStatusBanners";

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

  const bookRename = useBookRename({ book });
  const { bookTitle } = bookRename;
  const cover = useBookCover({ book });
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

  // ── Print-on-demand ───────────────────────────────────────────────────────
  const { printOnDemandSettings, handleSavePrintOnDemandSettings } = useBookPrintOnDemand({ book });

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
  const { navigateToPanel, handleInlineAiAction } = useBookEditorNavigation({
    bookId: book.id,
    setTool,
    setFocusMode,
    setPreset,
    handleCreateChapter: chapterCrud.handleCreateChapter,
    setCommands,
  });

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

  // ── Job retry handler ─────────────────────────────────────────────────────
  const { handleJobRetry } = useJobRetry({
    bookId: book.id,
    activeVersionId: activeVersion?.id,
    audiobook,
    translation,
    refetchBookJob,
  });

  // ── Status banners ────────────────────────────────────────────────────────
  const statusBanners = (
    <BookEditorStatusBanners
      jobLoading={jobLoading}
      jobError={jobError}
      jobsForBanner={jobsForBanner}
      billingPastDue={billing.pastDue ?? false}
      onJobRetry={handleJobRetry}
    />
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // FOCUS MODE
  // ═══════════════════════════════════════════════════════════════════════════
  if (focusMode) {
    return (
      <FocusModeEditorView
        publishToast={publishing.publishToast}
        topContent={statusBanners}
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
        statusContent={statusBanners}
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
        onDeleteChapter={chapterCrud.handleDeleteChapter}
        deletingChapterId={chapterCrud.deletingChapterId}
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
          className="fixed right-3 top-3 z-[1000] rounded-full bg-slate-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-lg backdrop-blur-sm sm:right-6 sm:top-24 dark:bg-white/90 dark:text-slate-900"
        >
          {publishing.publishToast}
        </div>
      )}
      <WorkspaceLayout
        header={
          <header>
            <h1 className="text-base font-medium uppercase tracking-widest text-slate-400 dark:text-white/50">
              {bookTitle}
            </h1>
          </header>
        }
        headerRight={<WorkspaceHeaderActions />}
        mainClassName="space-y-8 pb-16"
        main={
          <>
            {statusBanners}

            {/* Edit panel (has its own white card) */}
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
                preset={preset}
                focusMode={focusMode}
                isPublished={publishing.isPublished}
                activeTool={tool}
                tools={effectiveTools as Tool[]}
                onSetChapterPage={setChapterPage}
                onSelectChapter={selectChapter}
                onResetSessionWords={() => setSessionStartWords(null)}
                onWordCount={setWordCount}
                onAutoSave={chapterCrud.handleAutoSave}
                onDirty={() => chapterCrud.setHasUnsavedChanges(true)}
                onToggleFocusMode={() => setFocusMode((current) => !current)}
                onDeleteChapter={chapterCrud.handleDeleteChapter}
                onCreateChapter={chapterCrud.handleCreateChapter}
                isCreating={chapterCrud.isCreating}
                isSaving={chapterCrud.isSaving}
                lastSaved={chapterCrud.lastSaved}
                saveError={chapterCrud.saveError}
                isRenamingBook={bookRename.isRenamingBook}
                bookTitleDraft={bookRename.bookTitleDraft}
                onStartRenameBook={bookRename.handleStartRenameBook}
                onBookTitleDraftChange={bookRename.setBookTitleDraft}
                onSaveRenameBook={bookRename.handleSaveRenameBook}
                onCancelRenameBook={bookRename.handleCancelRenameBook}
                editingTitleId={chapterCrud.editingTitleId}
                tempTitle={chapterCrud.tempTitle}
                onStartEditTitle={chapterCrud.handleStartEditTitle}
                onTempTitleChange={chapterCrud.setTempTitle}
                onSaveTitle={chapterCrud.handleSaveTitle}
                onCancelEditTitle={chapterCrud.handleCancelEditTitle}
              />
            )}

            {/* All non-edit panels */}
            {tool !== "edit" && (
              <BookEditorPanelContent
                bookId={book.id}
                bookTitle={bookTitle}
                bookOriginalUrl={book.original_url ?? null}
                bookAudiobookStatus={typeof book.audiobook_status === "string" ? book.audiobook_status : null}
                bookTrailerStatus={typeof book.trailer_status === "string" ? book.trailer_status : null}
                bookTrailerUrl={typeof book.trailer_url === "string" ? book.trailer_url : null}
                authorDisplayName={authorDisplayName}
                tool={tool}
                tools={effectiveTools as Tool[]}
                chapters={chapters}
                activeVersion={activeVersion}
                activeLanguage={activeLanguage}
                bookVersions={bookVersions}
                totalBookWordCount={totalBookWordCount}
                selectedChapterId={selectedChapterId}
                selectedChapter={selectedChapter}
                importJobs={importJobs}
                stripeConfigured={stripeConfigured}
                marketingCampaigns={marketingCampaigns}
                printOnDemandSettings={printOnDemandSettings}
                onSavePrintOnDemandSettings={handleSavePrintOnDemandSettings}
                onNavigateToPanel={navigateToPanel}
                onSetSelectedChapterId={(id) => { setSelectedChapterId(id); setSessionStartWords(null); }}
                onResetSessionWords={() => setSessionStartWords(null)}
                cover={cover}
                audiobook={{ ...audiobook, bookLanguage: book.language ?? null, bookOriginalLanguage: book.original_language ?? null }}
                translation={translation}
                publishing={publishing}
                pricing={pricing}
                marketing={marketing}
                billing={billing}
                refetchBookJob={refetchBookJob}
              />
            )}
          </>
        }
      />
    </>
  );
}
