"use client";

import { memo, useState, type ChangeEventHandler } from "react";
import Image from "next/image";
import type { BookWorkspaceChapter } from "@/features/book-workspace/types";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
  onReorderChapter?: (
    sourceChapterId: string,
    targetChapterId: string
  ) => void;
  onDeleteChapter?: (chapterId: string) => void;
  deletingChapterId?: string | null;
};

function countWords(content: string | null): number {
  if (!content) return 0;
  try {
    const extract = (node: unknown): string => {
      if (!node || typeof node !== "object") return "";
      if ("text" in node) return (node as { text: string }).text;
      if (
        "content" in node &&
        Array.isArray((node as { content: unknown[] }).content)
      ) {
        return (node as { content: unknown[] }).content.map(extract).join("");
      }
      return "";
    };
    return extract(JSON.parse(content))
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  } catch {
    return content
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }
}

function formatWordCount(count: number): string {
  if (count === 0) return "Empty";
  if (count >= 10_000) return `${Math.round(count / 1000)}k`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function ChapterRail({
  bookTitle,
  coverImageUrl,
  chapters,
  selectedChapterId,
  onSelectChapter,
  onCreateChapter,
  isCreating,
  onMoveChapter,
  onReorderChapter,
  onDeleteChapter,
  deletingChapterId,
}: ChapterRailProps) {
  const [draggingChapterId, setDraggingChapterId] = useState<string | null>(
    null
  );
  const [dropTargetChapterId, setDropTargetChapterId] = useState<
    string | null
  >(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const chapterToDelete = confirmDeleteId
    ? chapters.find((ch) => ch.id === confirmDeleteId)
    : null;

  const totalWords = chapters.reduce(
    (sum, ch) => sum + countWords(ch.content),
    0
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Book header */}
      <div className="px-5 pb-3 pt-5">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-black/[0.06] bg-slate-50/60 dark:border-white/[0.08] dark:bg-white/[0.03]">
            {coverImageUrl ? (
              <Image
                src={coverImageUrl}
                alt={`${bookTitle} cover`}
                className="h-full w-full object-cover"
                width={48}
                height={48}
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-slate-400 dark:text-white/35">
                Cover
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-white/30">
              Book
            </p>
            <p className="mt-1 truncate text-[14px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-white/90">
              {bookTitle}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Chapters</h2>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-white/35">
            {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
          </span>
        </div>

        {totalWords > 0 ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
            {totalWords.toLocaleString()} words in the manuscript
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500 dark:text-white/55">Start by creating your first chapter.</p>
        )}
      </div>

      {/* Chapter list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {chapters.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center px-5 text-center text-sm text-slate-500 dark:text-white/45">
            Create your first chapter to start writing.
          </div>
        ) : (
          <div className="space-y-1.5">
            {chapters.map((chapter, index) => {
              const isActive = chapter.id === selectedChapterId;
              const words = countWords(chapter.content);
              const isEmpty = words === 0;
              const isDragTarget =
                dropTargetChapterId === chapter.id && draggingChapterId !== chapter.id;

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
                  className={`group relative transition ${
                    draggingChapterId === chapter.id ? "opacity-50" : ""
                  }`}
                >
                  {/* Left indicator */}
                  <div
                    className={cn(
                      "pointer-events-none absolute left-1 top-1/2 h-[calc(100%-0.5rem)] w-0.5 -translate-y-1/2 rounded-full",
                      isActive ? "bg-[#907AFF]" : "bg-transparent"
                    )}
                  />

                  <div
                    className={cn(
                      "flex items-center rounded-2xl border transition-colors",
                      isDragTarget
                        ? "border-[#907AFF]/25 bg-[#907AFF]/[0.06]"
                        : isActive
                          ? "border-slate-900/10 bg-slate-50 dark:border-white/10 dark:bg-white/[0.06]"
                          : "border-transparent hover:bg-slate-50/70 dark:hover:bg-white/[0.03]",
                      "py-0.5"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectChapter(chapter.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left"
                    >
                      <span
                        className={cn(
                          "w-5 shrink-0 text-right text-[12px] tabular-nums transition-colors",
                          isActive
                            ? "font-semibold text-slate-900 dark:text-white"
                            : "font-medium text-slate-400 dark:text-white/25"
                        )}
                      >
                        {index + 1}
                      </span>

                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[13px] transition-colors",
                          isActive
                            ? "font-semibold text-slate-900 dark:text-white"
                            : "font-medium text-slate-700 dark:text-white/70",
                          !isActive && isEmpty ? "opacity-60" : ""
                        )}
                      >
                        {chapter.title || `Chapter ${index + 1}`}
                      </span>

                      <span
                        className={cn(
                          "shrink-0 text-[11px] tabular-nums transition-colors",
                          isEmpty
                            ? isActive
                              ? "text-slate-400 dark:text-white/30"
                              : "text-slate-300 dark:text-white/20"
                            : isActive
                              ? "font-medium text-slate-500 dark:text-white/45"
                              : "text-slate-400 dark:text-white/35"
                        )}
                      >
                        {formatWordCount(words)}
                      </span>
                    </button>

                    {/* Drag / reorder — visible on hover */}
                    <div className="flex shrink-0 items-center pr-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "cursor-grab text-[11px] leading-none",
                          isActive ? "text-slate-400 dark:text-white/30" : "text-slate-300 dark:text-white/15"
                        )}
                      >
                        ⋮⋮
                      </span>
                      {onMoveChapter ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onMoveChapter(chapter.id, "up")}
                            disabled={index === 0}
                            className="rounded px-1 py-0.5 text-[11px] font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-white/35 dark:hover:bg-white/10 dark:hover:text-white/70"
                            aria-label={`Move ${chapter.title || `Chapter ${index + 1}`} up`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => onMoveChapter(chapter.id, "down")}
                            disabled={index === chapters.length - 1}
                            className="rounded px-1 py-0.5 text-[11px] font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-white/35 dark:hover:bg-white/10 dark:hover:text-white/70"
                            aria-label={`Move ${chapter.title || `Chapter ${index + 1}`} down`}
                          >
                            ↓
                          </button>
                        </>
                      ) : null}
                      {onDeleteChapter && chapters.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(chapter.id)}
                          disabled={deletingChapterId === chapter.id}
                          className="rounded px-1 py-0.5 text-[11px] font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-white/35 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                          aria-label={`Delete ${chapter.title || `Chapter ${index + 1}`}`}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create chapter */}
      <div className="px-5 pb-4 pt-3">
        <button
          type="button"
          onClick={onCreateChapter}
          disabled={isCreating}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-[13px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 dark:border-white/10 dark:text-white/45 dark:hover:border-white/20 dark:hover:bg-white/[0.03] dark:hover:text-white/70"
        >
          {isCreating ? "Creating..." : "+ New chapter"}
        </button>
      </div>

      {/* Delete confirmation dialog */}
      {onDeleteChapter ? (
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
              className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/[0.04]"
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
              className="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
            >
              Delete
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </div>
  );
}

export default memo(ChapterRail, (prev, next) => {
  return (
    prev.bookTitle === next.bookTitle &&
    prev.coverImageUrl === next.coverImageUrl &&
    prev.chapters === next.chapters &&
    prev.selectedChapterId === next.selectedChapterId &&
    prev.isCreating === next.isCreating &&
    prev.coverUploading === next.coverUploading &&
    prev.coverError === next.coverError &&
    prev.deletingChapterId === next.deletingChapterId
  );
});
