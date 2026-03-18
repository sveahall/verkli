"use client";

import { useState, type ChangeEventHandler } from "react";
import type { BookWorkspaceChapter } from "@/features/book-workspace/types";

type ChapterRailProps = {
  bookTitle: string;
  coverImageUrl: string | null;
  chapters: BookWorkspaceChapter[];
  selectedChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
  onCreateChapter: () => void;
  isCreating: boolean;
  onCoverChange: ChangeEventHandler<HTMLInputElement>;
  coverUploading: boolean;
  coverError: string | null;
  onMoveChapter?: (chapterId: string, direction: "up" | "down") => void;
  onReorderChapter?: (sourceChapterId: string, targetChapterId: string) => void;
};

export default function ChapterRail({
  chapters,
  selectedChapterId,
  onSelectChapter,
  onMoveChapter,
  onReorderChapter,
}: ChapterRailProps) {
  const [draggingChapterId, setDraggingChapterId] = useState<string | null>(null);
  const [dropTargetChapterId, setDropTargetChapterId] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-[calc(100vh-11rem)] flex-col">
      <div className="border-b border-black/[0.06] px-5 py-5 dark:border-white/[0.06]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">
          Write
        </p>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Chapters
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
              {chapters.length === 1 ? "1 chapter" : `${chapters.length} chapters`}
            </p>
          </div>
          <span className="rounded-full border border-black/[0.06] px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:border-white/[0.08] dark:text-white/45">
            Drag to reorder
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {chapters.length === 0 ? (
          <div className="flex h-full min-h-[220px] items-center justify-center px-5 text-center text-sm text-slate-500 dark:text-white/45">
            Create your first chapter from the command palette to start writing.
          </div>
        ) : (
          <div className="space-y-1.5">
            {chapters.map((chapter, index) => {
              const isActive = chapter.id === selectedChapterId;

              return (
                <div
                  key={chapter.id}
                  draggable
                  onDragStart={() => setDraggingChapterId(chapter.id)}
                  onDragEnd={() => {
                    setDraggingChapterId(null);
                    setDropTargetChapterId(null);
                  }}
                  onDragOver={(event) => {
                    if (!onReorderChapter || draggingChapterId == null) return;
                    event.preventDefault();
                    setDropTargetChapterId(chapter.id);
                  }}
                  onDrop={(event) => {
                    if (!onReorderChapter || draggingChapterId == null) return;
                    event.preventDefault();
                    if (draggingChapterId !== chapter.id) {
                      onReorderChapter(draggingChapterId, chapter.id);
                    }
                    setDraggingChapterId(null);
                    setDropTargetChapterId(null);
                  }}
                  className={`group rounded-2xl transition ${
                    draggingChapterId === chapter.id ? "opacity-60" : ""
                  }`}
                >
                  <div
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition ${
                      dropTargetChapterId === chapter.id && draggingChapterId !== chapter.id
                        ? "border-[#907AFF]/40 bg-[#907AFF]/[0.06] dark:border-[#907AFF]/50 dark:bg-[#907AFF]/[0.08]"
                        : ""
                    } ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                        : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white/70 dark:text-white/70 dark:hover:border-white/10 dark:hover:bg-white/[0.03]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectChapter(chapter.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          isActive
                            ? "bg-white/15 text-white dark:bg-slate-900/10 dark:text-slate-900"
                            : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/60"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="flex min-w-0 flex-1 items-start gap-2">
                        <span
                          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                            chapter.content
                              ? isActive
                                ? "bg-white/70 dark:bg-slate-900/50"
                                : "bg-emerald-500/80"
                              : isActive
                                ? "bg-white/40 dark:bg-slate-900/30"
                                : "bg-slate-300 dark:bg-white/20"
                          }`}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {chapter.title || `Chapter ${index + 1}`}
                          </span>
                          <span
                            className={`mt-0.5 block truncate text-xs ${
                              isActive
                                ? "text-white/70 dark:text-slate-700"
                                : "text-slate-400 dark:text-white/35"
                            }`}
                          >
                            {chapter.content ? "Ready to edit" : "Empty draft"}
                          </span>
                        </span>
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                      <span
                        aria-hidden="true"
                        className={`text-sm ${isActive ? "text-white/70 dark:text-slate-700" : "text-slate-300 dark:text-white/20"}`}
                      >
                        ⋮⋮
                      </span>
                      {onMoveChapter ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onMoveChapter(chapter.id, "up")}
                            disabled={index === 0}
                            className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                              isActive
                                ? "text-white/80 hover:bg-white/10 dark:text-slate-700 dark:hover:bg-slate-900/5"
                                : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/75"
                            } disabled:cursor-not-allowed disabled:opacity-30`}
                            aria-label={`Move ${chapter.title || `Chapter ${index + 1}`} up`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => onMoveChapter(chapter.id, "down")}
                            disabled={index === chapters.length - 1}
                            className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                              isActive
                                ? "text-white/80 hover:bg-white/10 dark:text-slate-700 dark:hover:bg-slate-900/5"
                                : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/75"
                            } disabled:cursor-not-allowed disabled:opacity-30`}
                            aria-label={`Move ${chapter.title || `Chapter ${index + 1}`} down`}
                          >
                            ↓
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
