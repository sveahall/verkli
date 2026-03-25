"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import ChapterRail from "../components/ChapterRail";
import EditorCanvas from "../components/EditorCanvas";
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

type FocusModeEditorViewProps = {
  publishToast: string | null;
  topContent?: ReactNode;
  bookTitle: string;
  authorDisplayName: string;
  bookId: string;
  chapters: Chapter[];
  selectedChapterId: string | null;
  selectedChapterIndex: number;
  selectedChapter: Chapter | null;
  preset: string;
  onSelectChapter: (chapterId: string) => void;
  onSelectPreviousChapter: () => void;
  onSelectNextChapter: () => void;
  onResetSessionWords: () => void;
  onAutoSave: (chapterId: string, jsonContent: Record<string, unknown>) => void;
  onDirty: () => void;
  onWordCount: (count: number) => void;
  onExitFocusMode: () => void;
};

export default function FocusModeEditorView({
  publishToast,
  topContent,
  bookTitle,
  authorDisplayName,
  bookId,
  chapters,
  selectedChapterId,
  selectedChapterIndex,
  selectedChapter,
  preset,
  onSelectChapter,
  onSelectPreviousChapter,
  onSelectNextChapter,
  onResetSessionWords,
  onAutoSave,
  onDirty,
  onWordCount,
  onExitFocusMode,
}: FocusModeEditorViewProps) {
  return (
    <>
      {publishToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-6 top-24 z-[1000] rounded-full bg-slate-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-lg backdrop-blur-sm dark:bg-white/90 dark:text-slate-900"
        >
          {publishToast}
        </div>
      )}
      <section className="mx-auto w-full max-w-[1760px] px-6 pb-20 pt-6 xl:px-8">
        {topContent}
        <div className="overflow-hidden">
          <div className="flex min-h-[calc(100vh-12rem)]">
            <EditorCanvas
              mode="focus"
              header={
                <div className="mb-5 border-b border-slate-200 pb-5 dark:border-white/[0.08]">
                  <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
                    {bookTitle}
                  </h1>
                  <p className="mt-1 text-[15px] text-slate-500 dark:text-white/50">
                    {authorDisplayName}
                  </p>
                </div>
              }
              toolbar={
                <ChapterRail
                  variant="compact"
                  title={
                    <span className="text-slate-400 dark:text-white/35">
                      Ch
                    </span>
                  }
                >
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPreviousChapter();
                        onResetSessionWords();
                      }}
                      disabled={selectedChapterIndex <= 0}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[14px] text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-35 dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
                      aria-label="Previous chapter"
                    >
                      &lsaquo;
                    </button>
                    {chapters.map((chapter, index) => {
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
                          aria-label={`Chapter ${index + 1}`}
                          aria-current={isActive ? "true" : undefined}
                          title={
                            isEmpty
                              ? "Empty chapter"
                              : `${chapterWords.toLocaleString()} words`
                          }
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectNextChapter();
                        onResetSessionWords();
                      }}
                      disabled={
                        selectedChapterIndex < 0 ||
                        selectedChapterIndex >= chapters.length - 1
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[14px] text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-35 dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
                      aria-label="Next chapter"
                    >
                      &rsaquo;
                    </button>
                  </div>
                </ChapterRail>
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
                  onFocusModeToggle={onExitFocusMode}
                  focusMode
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
          </div>
        </div>
      </section>
    </>
  );
}
