"use client";

import dynamic from "next/dynamic";
import BookWorkflowHeader from "../../BookWorkflowHeader";
import { countWordsInContent } from "../BookEditorView.helpers";
import type { Chapter, Tool } from "../BookEditorView.types";

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
}: SimplifiedEditViewProps) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-white/[0.06] dark:bg-[#111318] dark:shadow-none">
      {/* ── Workflow stepper (inside the card) ── */}
      <BookWorkflowHeader
        bookId={bookId}
        activeTool={activeTool}
        tools={tools}
        bare
      />

      {/* ── CHAPTERS / title / badge ── */}
      <div className="flex items-center justify-between px-8 pt-8 pb-3">
        <span className="shrink-0 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-white/30">
          Chapters
        </span>
        <h2 className="min-w-0 truncate text-sm font-semibold uppercase tracking-wide text-slate-800 dark:text-white/90">
          {bookTitle}
        </h2>
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
      </div>

      {/* ── Chapter numbers ── */}
      <div className="flex items-center gap-2 px-8 pb-5">
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
            <button
              key={chapter.id}
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
      </div>

      {/* ── Toolbar is rendered by TiptapEditor ── */}

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
    </div>
  );
}
