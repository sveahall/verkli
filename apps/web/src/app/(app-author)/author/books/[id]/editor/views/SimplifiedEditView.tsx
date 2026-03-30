"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import BookWorkflowHeader from "../../BookWorkflowHeader";
import { countWordsInContent } from "../BookEditorView.helpers";
import type { Chapter, Tool } from "../BookEditorView.types";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const TiptapEditor = dynamic(
  () => import("@/components/editor/TiptapEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] animate-pulse rounded-xl bg-slate-50 dark:bg-white/5" />
    ),
  }
);

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
  lastSaved = null,
  saveError = false,
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

  return (
    <div className="w-full rounded-2xl border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-white/[0.06] dark:bg-[#111318] dark:shadow-none">

      {/* ── Sticky header: stepper + chapters + chapter title ── */}
      <div className="sticky top-0 z-20 rounded-t-2xl border-b border-black/[0.04] bg-white/95 backdrop-blur-md dark:border-white/[0.04] dark:bg-[#111318]/95">
      {/* ── Workflow stepper ── */}
      <BookWorkflowHeader
        bookId={bookId}
        activeTool={activeTool}
        tools={tools}
        bare
        compact
      />

      {/* ── CHAPTERS / title / badge ── */}
      <div className="flex items-center gap-4 px-8 pt-4 pb-8">
        <div className="h-9 w-9 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center mx-2 sm:mx-6 lg:mx-16 xl:mx-20">
            <div className="min-w-0">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-white/30">
                Chapters
              </span>
            </div>

            <div className="min-w-0 max-w-[36rem] justify-self-center">
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
                  className="w-full min-w-0 truncate rounded-md border border-[#907AFF]/40 bg-white px-2 py-0.5 text-center text-sm font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-[#907AFF]/50 dark:border-white/20 dark:bg-white/[0.06] dark:text-white/90"
                />
              ) : (
                <button
                  type="button"
                  onClick={onStartRenameBook}
                  className="min-w-0 truncate text-sm font-semibold text-slate-800 transition hover:text-[#907AFF] dark:text-white/90 dark:hover:text-[#907AFF]"
                  title="Click to rename book"
                >
                  {bookTitle}
                </button>
              )}
            </div>

            <div className="flex min-w-0 items-center justify-end gap-3">
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  isPublished
                    ? "border-emerald-200 text-emerald-600 dark:border-emerald-800/30 dark:text-emerald-400"
                    : "border-slate-200 text-slate-500 dark:border-white/10 dark:text-white/40"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isPublished ? "bg-emerald-500" : "bg-[#907AFF]"}`} />
                {isPublished ? "Published" : "Draft"}
              </span>
              {/* Save status */}
              <span className="shrink-0 text-[11px] tabular-nums">
                {saveError ? (
                  <span className="text-red-500">Save failed</span>
                ) : isSaving ? (
                  <span className="text-slate-400 dark:text-white/30">Saving...</span>
                ) : lastSaved ? (
                  <span className="text-emerald-500 dark:text-emerald-400">Saved</span>
                ) : null}
              </span>
            </div>
          </div>
        </div>
        <div className="h-9 w-9 shrink-0" aria-hidden="true" />
      </div>

      {/* ── Chapter numbers ── */}
      <div className="flex items-center gap-4 px-8 pb-5">
        <div className="h-9 w-9 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-center gap-2 mx-2 sm:mx-6 lg:mx-16 xl:mx-20">
        {totalPages > 1 && (
          <button
            type="button"
            onClick={() => onSetChapterPage(Math.max(0, chapterPage - 1))}
            disabled={chapterPage === 0}
            className="flex h-8 w-8 items-center justify-center text-base text-slate-400 hover:text-slate-600 disabled:opacity-30 dark:text-white/30"
            aria-label="Previous chapters"
          >
            &laquo;
          </button>
        )}
        {visibleChapters.map((chapter, index) => {
          const globalIndex = startIndex + index;
          const isActive = chapter.id === selectedChapterId;
          const chapterWords = countWordsInContent(chapter.content);
          const isEmpty = chapterWords === 0;
          return (
            <div key={chapter.id} className="group/ch relative">
              <button
                type="button"
                onClick={() => {
                  onSelectChapter(chapter.id);
                  onResetSessionWords();
                }}
                className={`flex h-8 min-w-[2rem] items-center justify-center rounded text-sm tabular-nums transition-all duration-150 ${
                  isActive
                    ? "bg-slate-800 font-bold text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-white/35 dark:hover:bg-white/[0.06]"
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
          <span className="px-1 text-sm text-slate-300 dark:text-white/15">&hellip;</span>
        )}
        {totalPages > 1 && (
          <button
            type="button"
            onClick={() => onSetChapterPage(Math.min(totalPages - 1, chapterPage + 1))}
            disabled={chapterPage >= totalPages - 1}
            className="flex h-8 w-8 items-center justify-center text-base text-slate-400 hover:text-slate-600 disabled:opacity-30 dark:text-white/30"
            aria-label="Next chapters"
          >
            &raquo;
          </button>
        )}

        {onCreateChapter && (
          <button
            type="button"
            onClick={onCreateChapter}
            disabled={isCreating}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded border border-dashed border-slate-300 text-sm text-slate-400 transition hover:border-[#907AFF] hover:text-[#907AFF] disabled:opacity-40 dark:border-white/15 dark:text-white/30 dark:hover:border-[#907AFF] dark:hover:text-[#907AFF]"
            aria-label="Add chapter"
            title={isCreating ? "Creating..." : "Add chapter"}
          >
            +
          </button>
        )}
          </div>
        </div>
        <div className="h-9 w-9 shrink-0" aria-hidden="true" />
      </div>

      {/* ── Selected chapter title (editable) ── */}
      {selectedChapter && onStartEditTitle && (
        <div className="px-20 pb-2">
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
              className="w-full rounded-md border border-[#907AFF]/40 bg-white px-2 py-1 text-[13px] font-medium text-slate-700 outline-none focus:ring-1 focus:ring-[#907AFF]/50 dark:border-white/20 dark:bg-white/[0.06] dark:text-white/80"
            />
          ) : (
            <button
              type="button"
              onClick={() => onStartEditTitle(selectedChapter.id, selectedChapter.title)}
              className="text-[13px] font-medium text-slate-500 transition hover:text-[#907AFF] dark:text-white/50 dark:hover:text-[#907AFF]"
              title="Click to rename chapter"
            >
              {selectedChapter.title || "Untitled chapter"} &#8203;
              <span className="text-[11px] text-slate-300 dark:text-white/20">&#9998;</span>
            </button>
          )}
        </div>
      )}

      </div>{/* end sticky header */}

      {/* ── Editor content ── */}
      <div className="px-10 py-8 sm:px-14 sm:py-10">
        {selectedChapter ? (
          <TiptapEditor
            key={selectedChapter.id}
            content={selectedChapter.content}
            onUpdate={(json) => onAutoSave(selectedChapter.id, json)}
            onDirty={onDirty}
            placeholder="Start writing your chapter..."
            bookId={bookId}
            chapterId={selectedChapter.id}
            preset={preset}
            onWordCount={onWordCount}
            onFocusModeToggle={onToggleFocusMode}
            focusMode={focusMode}
          />
        ) : (
          <div className="flex h-[500px] items-center justify-center">
            <p className="text-sm text-slate-400 dark:text-white/35">
              {chapters.length === 0
                ? "Create your first chapter to start writing"
                : "Select a chapter above to edit"}
            </p>
          </div>
        )}
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
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/[0.04]"
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
