"use client";

import dynamic from "next/dynamic";
import type {
  BookWorkspaceChapter,
  InlineAiAction,
} from "@/features/book-workspace/types";

const TiptapEditor = dynamic(
  () => import("@/components/editor/TiptapEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[640px] animate-pulse rounded-2xl bg-slate-100/80 dark:bg-white/5" />
    ),
  }
);

type EditorCanvasProps = {
  bookId: string;
  selectedChapter: BookWorkspaceChapter | null;
  editingTitleId: string | null;
  tempTitle: string;
  isSaving: boolean;
  saveError: boolean;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
  wordCount: number;
  sessionWords: number;
  preset: string;
  focusMode: boolean;
  onPresetChange: (value: string) => void;
  onFocusModeToggle: () => void;
  onNewChapter: () => void;
  onCommandPalette: () => void;
  onStartEditTitle: (chapterId: string, title: string) => void;
  onTempTitleChange: (value: string) => void;
  onSaveTitle: (chapterId: string) => void;
  onCancelEditTitle: () => void;
  onWordCount: (count: number) => void;
  onDirty: () => void;
  onAutoSave: (chapterId: string, json: Record<string, unknown>) => void;
  onInlineAction?: (action: InlineAiAction, selectedText: string) => void;
};

function SaveIndicator({
  isSaving,
  saveError,
  hasUnsavedChanges,
  lastSaved,
}: {
  isSaving: boolean;
  saveError: boolean;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
}) {
  if (isSaving) {
    return (
      <span className="flex items-center gap-1.5 text-[#907AFF] dark:text-[#b8a9ff]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        Saving
      </span>
    );
  }

  if (saveError) {
    return (
      <span className="flex items-center gap-1.5 text-red-500 dark:text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Error
      </span>
    );
  }

  if (hasUnsavedChanges) {
    return (
      <span className="flex items-center gap-1.5 text-amber-500 dark:text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Unsaved
      </span>
    );
  }

  if (lastSaved) {
    return (
      <span className="flex items-center gap-1.5 text-emerald-500/80 dark:text-emerald-400/70">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Saved
      </span>
    );
  }

  return (
    <span className="text-slate-400 dark:text-white/40">Autosave</span>
  );
}

export default function EditorCanvas({
  bookId,
  selectedChapter,
  editingTitleId,
  tempTitle,
  isSaving,
  saveError,
  hasUnsavedChanges,
  lastSaved,
  wordCount,
  sessionWords,
  preset,
  focusMode,
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
  onInlineAction,
}: EditorCanvasProps) {
  if (!selectedChapter) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center px-8">
        <div className="max-w-sm text-center">
          <p className="text-sm text-slate-500 dark:text-white/45">
            Select a chapter to start writing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Editor header: title + status bar ── */}
      <div className="border-b border-slate-200/70 px-8 py-5 dark:border-white/10">
        {editingTitleId === selectedChapter.id ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={tempTitle}
              onChange={(event) => onTempTitleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSaveTitle(selectedChapter.id);
                if (event.key === "Escape") onCancelEditTitle();
              }}
              className="min-w-[240px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-base font-medium text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/30 dark:border-white/10 dark:bg-white/5 dark:text-white"
              autoFocus
            />
            <button
              type="button"
              onClick={() => onSaveTitle(selectedChapter.id)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white dark:bg-white dark:text-slate-900"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancelEditTitle}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600 dark:border-white/10 dark:text-white/65"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h2 className="truncate text-xl font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
                  {selectedChapter.title}
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    onStartEditTitle(
                      selectedChapter.id,
                      selectedChapter.title
                    )
                  }
                  className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-white/35 dark:hover:bg-white/10 dark:hover:text-white/70"
                >
                  Rename
                </button>
              </div>
            </div>

            {/* Save status */}
            <div className="shrink-0 pt-1 text-xs" role="status" aria-live="polite">
              <SaveIndicator
                isSaving={isSaving}
                saveError={saveError}
                hasUnsavedChanges={hasUnsavedChanges}
                lastSaved={lastSaved}
              />
            </div>
          </div>
        )}

        {/* ── Compact status bar ── */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400 dark:text-white/35">
          <span>{wordCount.toLocaleString()} words</span>
          {sessionWords > 0 && (
            <span className="text-emerald-500/80 dark:text-emerald-400/60">
              +{sessionWords} this session
            </span>
          )}

          <div className="flex items-center gap-1 border-l border-slate-200/70 pl-4 dark:border-white/10">
            <label className="inline-flex items-center gap-1.5">
              <span>Preset</span>
              <select
                value={preset}
                onChange={(event) => onPresetChange(event.target.value)}
                className="bg-transparent text-slate-600 outline-none dark:text-white/60"
              >
                <option value="novel">Novel</option>
                <option value="essay">Essay</option>
                <option value="screenplay">Screenplay</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={onFocusModeToggle}
            className={`rounded-md px-2 py-0.5 font-medium transition ${
              focusMode
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white/60"
            }`}
          >
            {focusMode ? "Exit focus" : "Focus"}
          </button>

          <button
            type="button"
            onClick={onCommandPalette}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white/60"
          >
            <kbd className="rounded border border-slate-200 px-1 py-px font-mono text-[10px] dark:border-white/10">
              ⌘K
            </kbd>
          </button>
        </div>
      </div>

      {/* ── Editor surface ── */}
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-8 pt-4 sm:px-6 xl:px-8">
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
          onFocusModeToggle={onFocusModeToggle}
          focusMode={focusMode}
          onInlineAction={onInlineAction}
        />
      </div>
    </div>
  );
}
