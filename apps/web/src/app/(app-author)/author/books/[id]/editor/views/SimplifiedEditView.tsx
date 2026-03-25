"use client";

import dynamic from "next/dynamic";
import ChapterRail from "../components/ChapterRail";
import EditorCanvas from "../components/EditorCanvas";
import WriteWorkspace from "../components/WriteWorkspace";
import { countWordsInContent } from "../BookEditorView.helpers";
import type { Chapter } from "../BookEditorView.types";

const TiptapEditor = dynamic(
  () => import("@/components/editor/TiptapEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
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
  wordCount: number;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
  preset: string;
  focusMode: boolean;
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
  wordCount,
  isSaving,
  hasUnsavedChanges,
  lastSaved,
  preset,
  focusMode,
  onSetChapterPage,
  onSelectChapter,
  onResetSessionWords,
  onWordCount,
  onAutoSave,
  onDirty,
  onToggleFocusMode,
}: SimplifiedEditViewProps) {
  return (
    <WriteWorkspace
      chapterRail={
        <ChapterRail variant="compact" title="Ch">
          <div className="flex items-center gap-0.5">
            {totalPages > 1 && (
              <button
                type="button"
                onClick={() => onSetChapterPage(Math.max(0, chapterPage - 1))}
                disabled={chapterPage === 0}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[14px] text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-35 dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
                aria-label="Previous chapters"
              >
                &lsaquo;
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
                  className={`flex h-8 min-w-[1.9rem] items-center justify-center rounded-lg text-[12px] tabular-nums transition-colors duration-150 ${
                    isActive
                      ? "bg-slate-900 font-semibold text-white ring-1 ring-[#907AFF]/30 shadow-[0_10px_25px_rgba(15,23,42,0.12)] dark:bg-white dark:text-slate-900"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-white/45 dark:hover:bg-white/[0.06] dark:hover:text-white/80"
                  } ${!isActive && isEmpty ? "opacity-55" : ""}`}
                  aria-label={`Chapter ${globalIndex + 1}${
                    isEmpty ? " (empty)" : ""
                  }`}
                  aria-current={isActive ? "true" : undefined}
                  title={
                    isEmpty
                      ? "Empty chapter"
                      : `${chapterWords.toLocaleString()} words`
                  }
                >
                  {globalIndex + 1}
                </button>
              );
            })}
            {totalPages > 1 && chapterPage < totalPages - 1 && (
              <span className="px-1 text-[11px] text-slate-300 dark:text-white/25">
                &hellip;
              </span>
            )}
            {totalPages > 1 && (
              <button
                type="button"
                onClick={() =>
                  onSetChapterPage(Math.min(totalPages - 1, chapterPage + 1))
                }
                disabled={chapterPage >= totalPages - 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[14px] text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-35 dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
                aria-label="Next chapters"
              >
                &rsaquo;
              </button>
            )}
          </div>
        </ChapterRail>
      }
      editorCanvas={
        <EditorCanvas
          mode="edit"
          header={
            <div className="flex items-center justify-between gap-4 border-b border-slate-200/70 bg-white/55 px-10 py-4 sm:px-14 dark:border-white/10 dark:bg-white/[0.02]">
              <div className="min-w-0">
                <h1 className="truncate text-[16px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white/90">
                  {bookTitle}
                </h1>
                <p className="mt-1 text-[12px] text-slate-500 dark:text-white/50">
                  {selectedChapter
                    ? `Kapitel ${
                        chapters.findIndex((chapter) => chapter.id === selectedChapter.id) +
                        1
                      } av ${chapters.length}`
                    : `${chapters.length} kapitel`}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                {wordCount > 0 ? (
                  <span className="tabular-nums rounded-full border border-black/[0.06] bg-white/50 px-3 py-1 text-[12px] font-semibold text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/80">
                    {wordCount.toLocaleString("sv-SE")} ord
                  </span>
                ) : null}

                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold tabular-nums transition ${
                    isSaving
                      ? "border-[#907AFF]/20 bg-[#907AFF]/10 text-slate-700 dark:border-[#b8a9ff]/20 dark:bg-[#b8a9ff]/10 dark:text-white/80"
                      : hasUnsavedChanges
                        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
                        : lastSaved
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300"
                          : "border-black/[0.06] bg-white/50 text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/70"
                  }`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      isSaving
                        ? "animate-pulse bg-[#907AFF]"
                        : hasUnsavedChanges
                          ? "bg-amber-500"
                          : lastSaved
                            ? "bg-emerald-500"
                            : "bg-slate-300 dark:bg-white/20"
                    }`}
                  />
                  {isSaving
                    ? "Sparar..."
                    : hasUnsavedChanges
                      ? "Osparad"
                      : lastSaved
                        ? "Sparat"
                        : "Autosave"}
                </span>
              </div>
            </div>
          }
        >
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
              <p className="text-[14px] text-slate-400 dark:text-white/40">
                {chapters.length === 0
                  ? "Create your first chapter to start writing"
                  : "Select a chapter above to edit"}
              </p>
            </div>
          )}
        </EditorCanvas>
      }
    />
  );
}
