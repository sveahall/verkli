"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import type { Editor } from "@tiptap/react";
import BookWorkflowHeader from "../../BookWorkflowHeader";
import { countWordsInContent } from "../BookEditorView.helpers";
import type { Chapter, Tool } from "../BookEditorView.types";
import type { InlineAiAction } from "@/features/book-workspace/types";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const EditorSidePanel = dynamic(() => import("@/components/editor/EditorSidePanel"), { ssr: false });
const EditorStatusBar = dynamic(() => import("@/components/editor/EditorStatusBar"), { ssr: false });

const editorImport = () => import("@/components/editor/TiptapEditor");

// Start downloading the editor chunk immediately, don't wait for render
if (typeof window !== "undefined") editorImport();

const TiptapEditor = dynamic(editorImport, {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] items-center justify-center rounded-xl bg-background dark:bg-card">
      <span className="text-sm text-muted-foreground dark:text-muted-foreground">Loading editor...</span>
    </div>
  ),
});

type SimplifiedEditViewProps = {
  bookId: string;
  bookTitle: string;
  chapters: Chapter[];
  visibleChapters: Chapter[];
  startIndex: number;
  totalPages: number;
  chapterPage: number;
  selectedChapterId: string | null;
  selectedChapter: Chapter | null;
  preset: string;
  focusMode: boolean;
  isPublished?: boolean;
  activeTool: Tool;
  tools: Tool[];
  /** Bubble-menu AI actions on the current selection. */
  onInlineAiAction?: (action: InlineAiAction, selectedText: string) => void;
  onSetChapterPage: (page: number) => void;
  onSelectChapter: (chapterId: string) => void;
  onResetSessionWords: () => void;
  onWordCount: (count: number) => void;
  onAutoSave: (chapterId: string, jsonContent: Record<string, unknown>) => void;
  onDirty: () => void;
  onToggleFocusMode: () => void;
  onDeleteChapter?: (chapterId: string) => void;
  onCreateChapter?: () => void;
  isCreating?: boolean;
  // Book rename
  isRenamingBook?: boolean;
  bookTitleDraft?: string;
  onStartRenameBook?: () => void;
  onBookTitleDraftChange?: (value: string) => void;
  onSaveRenameBook?: () => void;
  onCancelRenameBook?: () => void;
  // Save status
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  lastSaved?: Date | null;
  saveError?: boolean;
  // Chapter rename
  editingTitleId?: string | null;
  tempTitle?: string;
  onStartEditTitle?: (chapterId: string, title: string) => void;
  onTempTitleChange?: (value: string) => void;
  onSaveTitle?: (chapterId: string) => void;
  onCancelEditTitle?: () => void;
};

export default function SimplifiedEditView({
  bookId,
  bookTitle,
  chapters,
  visibleChapters,
  startIndex,
  totalPages,
  chapterPage,
  selectedChapterId,
  selectedChapter,
  preset,
  focusMode,
  isPublished = false,
  activeTool,
  tools,
  onInlineAiAction,
  onSetChapterPage,
  onSelectChapter,
  onResetSessionWords,
  onWordCount,
  onAutoSave,
  onDirty,
  onToggleFocusMode,
  onDeleteChapter,
  onCreateChapter,
  isCreating = false,
  isSaving = false,
  hasUnsavedChanges = false,
  lastSaved = null,
  isRenamingBook = false,
  bookTitleDraft = "",
  onStartRenameBook,
  onBookTitleDraftChange,
  onSaveRenameBook,
  onCancelRenameBook,
  editingTitleId = null,
  tempTitle = "",
  onStartEditTitle,
  onTempTitleChange,
  onSaveTitle,
  onCancelEditTitle,
}: SimplifiedEditViewProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const chapterToDelete = confirmDeleteId
    ? chapters.find((ch) => ch.id === confirmDeleteId)
    : null;

  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  const toolbarRefCb = useCallback((el: HTMLElement | null) => setToolbarTarget(el), []);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [tiptapEditor, setTiptapEditor] = useState<Editor | null>(null);
  const [liveWordCount, setLiveWordCount] = useState(0);
  const handleEditorReady = useCallback((ed: Editor) => setTiptapEditor(ed), []);
  const handleWordCountWrapped = useCallback((count: number) => { setLiveWordCount(count); onWordCount(count); }, [onWordCount]);

  // Stable ref for onAutoSave to prevent TiptapEditor re-renders
  const onAutoSaveRef = useRef(onAutoSave);
  useEffect(() => {
    onAutoSaveRef.current = onAutoSave;
  }, [onAutoSave]);

  /**
   * Bubble-menu AI actions navigate away from the editor, which unmounts
   * TiptapEditor.
   *
   * This used to be the only place that survived that unmount: the editor's
   * cleanup cleared the autosave debounce without flushing it, so an action
   * fired within 500 ms of the last keystroke dropped those characters, and
   * this call was the local patch for that one path. The cleanup now flushes
   * (see autosaveScheduler), which covers every unmount — chapter switches and
   * route changes included, not just this one.
   *
   * Kept anyway: it persists while the editor is still mounted and the
   * selection is still live, which is a little earlier than unmount, and a
   * duplicate write of identical content is harmless.
   */
  const handleInlineAiActionWithFlush = useCallback(
    (action: InlineAiAction, selectedText: string) => {
      if (tiptapEditor && !tiptapEditor.isDestroyed && selectedChapterId) {
        onAutoSaveRef.current(selectedChapterId, tiptapEditor.getJSON());
      }
      onInlineAiAction?.(action, selectedText);
    },
    [onInlineAiAction, selectedChapterId, tiptapEditor]
  );

  // Memoize word counts so JSON.parse isn't called on every render
  const wordCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const ch of visibleChapters) {
      map.set(ch.id, countWordsInContent(ch.content));
    }
    return map;
  }, [visibleChapters]);

  // Stable callback that never changes identity — prevents TiptapEditor re-renders
  const handleAutoSave = useCallback(
    (json: Record<string, unknown>) => {
      if (selectedChapterId) onAutoSaveRef.current(selectedChapterId, json);
    },
    [selectedChapterId]
  );

  // Memoize editor to prevent unnecessary re-renders
  const editorElement = useMemo(() => {
    if (!selectedChapter) return null;
    return (
      <TiptapEditor
        key={selectedChapter.id}
        content={selectedChapter.content}
        onUpdate={handleAutoSave}
        onDirty={onDirty}
        placeholder="Start writing your chapter..."
        bookId={bookId}
        chapterId={selectedChapter.id}
        preset={preset}
        onWordCount={handleWordCountWrapped}
        onFocusModeToggle={onToggleFocusMode}
        focusMode={focusMode}
        toolbarPortalTarget={toolbarTarget}
        onEditorReady={handleEditorReady}
        onInlineAction={handleInlineAiActionWithFlush}
      />
    );
  }, [selectedChapter, handleAutoSave, onDirty, bookId, preset, handleWordCountWrapped, onToggleFocusMode, focusMode, toolbarTarget, handleEditorReady, handleInlineAiActionWithFlush]);

  return (
    <div className="w-full rounded-2xl border border-black/[0.04] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-border dark:bg-card dark:shadow-none">

      {/* ── Workflow stepper (scrolls away) ── */}
      <div className="rounded-t-2xl bg-card dark:bg-card">
      <BookWorkflowHeader
        bookId={bookId}
        activeTool={activeTool}
        tools={tools}
        bare
        compact
      />

      {/* ── CHAPTERS / title / badge ── */}
      <div className="flex items-center gap-2 px-3 pb-4 pt-5 sm:gap-4 sm:px-6">
        <div className="hidden h-9 w-9 shrink-0 sm:block" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-y-3 sm:mx-6 sm:grid-cols-[auto_minmax(0,1fr)_auto] lg:mx-16 xl:mx-20">
            <div className="min-w-0">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-muted-foreground dark:text-muted-foreground">
                Chapters
              </span>
            </div>

            <div className="col-span-2 row-start-2 w-full min-w-0 max-w-[36rem] text-left sm:col-span-1 sm:row-start-auto sm:px-2 sm:text-center">
              {isRenamingBook && onSaveRenameBook && onCancelRenameBook && onBookTitleDraftChange ? (
                <input
                  type="text"
                  value={bookTitleDraft}
                  onChange={(e) => onBookTitleDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSaveRenameBook();
                    if (e.key === "Escape") onCancelRenameBook();
                  }}
                  onBlur={onSaveRenameBook}
                  autoFocus
                  className="w-full min-w-0 truncate rounded-md border border-[#907AFF]/40 bg-card px-2 py-0.5 text-center text-sm font-semibold text-foreground outline-none focus:ring-1 focus:ring-[#907AFF]/50 dark:border-border dark:bg-card dark:text-foreground"
                />
              ) : (
                <button
                  type="button"
                  onClick={onStartRenameBook}
                  className="block w-full min-w-0 truncate text-left text-sm font-semibold text-foreground transition hover:text-accent-foreground sm:text-center dark:text-foreground dark:hover:text-accent-foreground"
                  title="Click to rename book"
                >
                  {bookTitle}
                </button>
              )}
            </div>

            <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-3 sm:col-start-auto sm:row-start-auto">
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  isPublished
                    ? "border-emerald-200 text-emerald-600 dark:border-emerald-800/30 dark:text-emerald-400"
                    : "border-border text-muted-foreground dark:border-border dark:text-muted-foreground"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isPublished ? "bg-emerald-500" : "bg-[#907AFF]"}`} />
                {isPublished ? "Published" : "Draft"}
              </span>
            </div>
          </div>
        </div>
        <div className="hidden h-9 w-9 shrink-0 sm:block" aria-hidden="true" />
      </div>
      </div>{/* end non-sticky section */}

      {/* ── Sticky: chapter numbers + toolbar ── */}
      <div className="sticky top-0 z-20 border-b border-black/[0.04] bg-card dark:border-border dark:bg-card">

      {/* ── Chapter numbers ── */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-3 sm:px-8">
        <div className="flex items-center" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex items-center justify-center gap-1 sm:gap-2">
        {totalPages > 1 && (
          <button
            type="button"
            onClick={() => onSetChapterPage(Math.max(0, chapterPage - 1))}
            disabled={chapterPage === 0}
            className="flex h-8 w-8 items-center justify-center text-base text-muted-foreground hover:text-muted-foreground disabled:opacity-30 dark:text-muted-foreground"
            aria-label="Previous chapters"
          >
            &laquo;
          </button>
        )}
        {visibleChapters.map((chapter, index) => {
          const globalIndex = startIndex + index;
          const isActive = chapter.id === selectedChapterId;
          const chapterWords = wordCounts.get(chapter.id) ?? 0;
          const isEmpty = chapterWords === 0;
          return (
            <div key={chapter.id} className="group/ch relative">
              <button
                type="button"
                onClick={() => {
                  onSelectChapter(chapter.id);
                  onResetSessionWords();
                }}
                className={`flex h-8 min-w-[2.4rem] items-center justify-center rounded text-sm tabular-nums transition-colors duration-150 ${
                  isActive
                    ? "bg-primary font-bold text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-accent"
                } ${!isActive && isEmpty ? "opacity-40" : ""}`}
                aria-label={`Chapter ${globalIndex + 1}${isEmpty ? " (empty)" : ""}`}
                aria-current={isActive ? "true" : undefined}
                title={isEmpty ? "Empty chapter" : `${chapterWords.toLocaleString()} words`}
              >
                {globalIndex + 1}
              </button>
              {onDeleteChapter && chapters.length > 1 && isActive && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(chapter.id)}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold leading-none text-white opacity-0 transition-opacity group-hover/ch:opacity-100"
                  aria-label={`Delete chapter ${globalIndex + 1}`}
                  title="Delete chapter"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        {totalPages > 1 && chapterPage < totalPages - 1 && (
          <span className="px-1 text-sm text-muted-foreground dark:text-muted-foreground">&hellip;</span>
        )}
        {totalPages > 1 && (
          <button
            type="button"
            onClick={() => onSetChapterPage(Math.min(totalPages - 1, chapterPage + 1))}
            disabled={chapterPage >= totalPages - 1}
            className="flex h-8 w-8 items-center justify-center text-base text-muted-foreground hover:text-muted-foreground disabled:opacity-30 dark:text-muted-foreground"
            aria-label="Next chapters"
          >
            &raquo;
          </button>
        )}

          </div>
        </div>
      </div>

      {/* ── Selected chapter title (editable) ── */}
      {selectedChapter && onStartEditTitle && (
        <div className="mx-auto max-w-7xl px-5 pb-1 pt-4 sm:px-12">
          {editingTitleId === selectedChapter.id && onSaveTitle && onCancelEditTitle && onTempTitleChange ? (
            <input
              type="text"
              value={tempTitle}
              onChange={(e) => onTempTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveTitle(selectedChapter.id);
                if (e.key === "Escape") onCancelEditTitle();
              }}
              onBlur={() => onSaveTitle(selectedChapter.id)}
              autoFocus
              className="w-full rounded-md border border-[#907AFF]/40 bg-card px-2 py-1 text-[13px] font-medium text-foreground outline-none focus:ring-1 focus:ring-[#907AFF]/50 dark:border-border dark:bg-card dark:text-foreground"
            />
          ) : (
            <button
              type="button"
              onClick={() => onStartEditTitle(selectedChapter.id, selectedChapter.title)}
              className="text-[13px] font-medium text-muted-foreground transition hover:text-accent-foreground dark:text-muted-foreground dark:hover:text-accent-foreground"
              title="Click to rename chapter"
            >
              {selectedChapter.title || "Untitled chapter"} &#8203;
              <span className="text-[11px] text-muted-foreground dark:text-muted-foreground">&#9998;</span>
            </button>
          )}
        </div>
      )}


      {/* ── Toolbar row: portal target + actions ── */}
      <div className="mx-auto flex max-w-7xl items-center gap-1 px-3 pb-4 sm:gap-2 sm:px-8">
        <div ref={toolbarRefCb} className="min-w-0 flex-1" />
        {onCreateChapter && (
          <button
            type="button"
            onClick={onCreateChapter}
            disabled={isCreating}
            className="flex flex-col shrink-0 items-left justify-center gap-1 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-[#907AFF]/5 hover:text-accent-foreground disabled:opacity-40 dark:text-muted-foreground dark:hover:text-accent-foreground"
            aria-label="Add chapter"
            title={isCreating ? "Creating..." : "Add chapter"}
          >
            <span className="text-base leading-none">+</span>
            <span className="text-[10px] leading-none">add chapter</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex flex-col shrink-0 items-center justify-center gap-1 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:border-[#907AFF]/30 hover:bg-[#907AFF]/5 hover:text-accent-foreground dark:border-border dark:text-muted-foreground dark:hover:border-[#907AFF]/30 dark:hover:text-accent-foreground"
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 12.5V3.5M8 3.5L3.5 8M8 3.5L12.5 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[11px] text-muted-foreground dark:text-muted-foreground">scroll to top</span>
        </button>
      </div>

      </div>{/* end sticky header */}

      {/* ── Editor content + side panel (inside white card) ── */}
      <div className="flex min-h-[520px] flex-col lg:flex-row">
        {/* Main writing surface */}
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-6 py-0 sm:px-10 sm:py-10">
            {editorElement ?? (
              <div className="flex h-[500px] items-center justify-center">
                <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                  {chapters.length === 0
                    ? "Create your first chapter to start writing"
                    : "Select a chapter above to edit"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Side panel — inside the card, right edge */}
        {tiptapEditor && (
          <EditorSidePanel
            editor={tiptapEditor}
            preset={preset}
            onPresetChange={() => {}}
            open={sidePanelOpen}
            onToggle={() => setSidePanelOpen((v) => !v)}
          />
        )}
      </div>

      {/* ── Status bar (inside card, at bottom) ── */}
      <div className="rounded-b-2xl border-t border-black/[0.04] dark:border-border">
        <EditorStatusBar
          wordCount={liveWordCount}
          isSaving={isSaving}
          hasUnsavedChanges={hasUnsavedChanges}
          lastSaved={lastSaved}
          focusMode={focusMode}
          sidePanelOpen={sidePanelOpen}
          onToggleFocusMode={onToggleFocusMode}
          onToggleSidePanel={() => setSidePanelOpen((v) => !v)}
        />
      </div>

      {/* Delete chapter confirmation */}
      {onDeleteChapter && (
        <Dialog open={confirmDeleteId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
          <DialogHeader>
            <DialogTitle>Delete chapter</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{chapterToDelete?.title || "this chapter"}</strong>? This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-background dark:border-border dark:text-foreground dark:hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmDeleteId) {
                  onDeleteChapter(confirmDeleteId);
                  setConfirmDeleteId(null);
                }
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
            >
              Delete
            </button>
          </DialogFooter>
        </Dialog>
      )}

    </div>
  );
}
