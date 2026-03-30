"use client";

import type { ChangeEventHandler, ReactNode } from "react";
import FeatureChapterRail from "@/features/book-workspace/ChapterRail";
import FeatureEditorCanvas from "@/features/book-workspace/EditorCanvas";
import {
  type InlineAiAction,
} from "@/features/book-workspace/types";
import FeatureWriteWorkspace from "@/features/author-workspaces/write/WriteWorkspace";
import BookWorkflowHeader from "../../BookWorkflowHeader";
import type { Chapter, Tool } from "../BookEditorView.types";

type WriteOnlyWorkspaceViewProps = {
  publishToast: string | null;
  statusContent?: ReactNode;
  bookId: string;
  bookTitle: string;
  tool: Tool;
  tools: Tool[];
  chapters: Chapter[];
  wordCount: number;
  displayCoverUrl: string | null;
  selectedChapterId: string | null;
  selectedChapter: Chapter | null;
  editingTitleId: string | null;
  tempTitle: string;
  isSaving: boolean;
  saveError: boolean;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
  sessionWords: number;
  preset: string;
  focusMode: boolean;
  coverUploading: boolean;
  coverError: string | null;
  isCreating: boolean;
  onSelectChapter: (chapterId: string) => void;
  onResetSessionWords: () => void;
  onCreateChapter: () => void;
  onCoverChange: ChangeEventHandler<HTMLInputElement>;
  onMoveChapter: (chapterId: string, direction: "up" | "down") => void;
  onReorderChapters: (
    sourceChapterId: string,
    targetChapterId: string
  ) => void;
  onDeleteChapter?: (chapterId: string) => void;
  deletingChapterId?: string | null;
  onPresetChange: (value: string) => void;
  onFocusModeToggle: () => void;
  onCommandPalette: () => void;
  onStartEditTitle: (chapterId: string, title: string) => void;
  onTempTitleChange: (value: string) => void;
  onSaveTitle: (chapterId: string) => void;
  onCancelEditTitle: () => void;
  onWordCount: (count: number) => void;
  onDirty: () => void;
  onAutoSave: (chapterId: string, jsonContent: Record<string, unknown>) => void;
  onInlineAiAction: (action: InlineAiAction, selectedText: string) => void;
};

export default function WriteOnlyWorkspaceView({
  publishToast,
  statusContent,
  bookId,
  bookTitle,
  tool,
  tools,
  chapters,
  wordCount,
  displayCoverUrl,
  selectedChapterId,
  selectedChapter,
  editingTitleId,
  tempTitle,
  isSaving,
  saveError,
  hasUnsavedChanges,
  lastSaved,
  sessionWords,
  preset,
  focusMode,
  coverUploading,
  coverError,
  isCreating,
  onSelectChapter,
  onResetSessionWords,
  onCreateChapter,
  onCoverChange,
  onMoveChapter,
  onReorderChapters,
  onDeleteChapter,
  deletingChapterId,
  onPresetChange,
  onFocusModeToggle,
  onCommandPalette,
  onStartEditTitle,
  onTempTitleChange,
  onSaveTitle,
  onCancelEditTitle,
  onWordCount,
  onDirty,
  onAutoSave,
  onInlineAiAction,
}: WriteOnlyWorkspaceViewProps) {
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
      <section className="w-full pb-20 pt-6">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          {statusContent}

          <div className="mb-5">
            <BookWorkflowHeader
              bookId={bookId}
              activeTool={tool}
              tools={tools}
            />
          </div>

          <FeatureWriteWorkspace
            chapterRail={
              <FeatureChapterRail
                bookTitle={bookTitle}
                coverImageUrl={displayCoverUrl}
                chapters={chapters}
                selectedChapterId={selectedChapterId}
                onSelectChapter={(chapterId) => {
                  onSelectChapter(chapterId);
                  onResetSessionWords();
                }}
                onCreateChapter={onCreateChapter}
                isCreating={isCreating}
                onCoverChange={onCoverChange}
                coverUploading={coverUploading}
                coverError={coverError}
                onMoveChapter={onMoveChapter}
                onReorderChapter={onReorderChapters}
                onDeleteChapter={onDeleteChapter}
                deletingChapterId={deletingChapterId}
              />
            }
            editorCanvas={
              <FeatureEditorCanvas
                bookId={bookId}
                selectedChapter={selectedChapter}
                editingTitleId={editingTitleId}
                tempTitle={tempTitle}
                isSaving={isSaving}
                saveError={saveError}
                hasUnsavedChanges={hasUnsavedChanges}
                lastSaved={lastSaved}
                wordCount={wordCount}
                sessionWords={sessionWords}
                preset={preset}
                focusMode={focusMode}
                onPresetChange={onPresetChange}
                onFocusModeToggle={onFocusModeToggle}
                onNewChapter={onCreateChapter}
                onCommandPalette={onCommandPalette}
                onStartEditTitle={onStartEditTitle}
                onTempTitleChange={onTempTitleChange}
                onSaveTitle={onSaveTitle}
                onCancelEditTitle={onCancelEditTitle}
                onWordCount={onWordCount}
                onDirty={onDirty}
                onAutoSave={onAutoSave}
                onInlineAction={onInlineAiAction}
              />
            }
          />
        </div>
      </section>
    </>
  );
}
