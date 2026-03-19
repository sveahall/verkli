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
  onReorderChapter?: (
    sourceChapterId: string,
    targetChapterId: string
  ) => void;
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

export default function ChapterRail({
  chapters,
  selectedChapterId,
  onSelectChapter,
  onCreateChapter,
  isCreating,
  onMoveChapter,
  onReorderChapter,
}: ChapterRailProps) {
  const [draggingChapterId, setDraggingChapterId] = useState<string | null>(
    null
  );
  const [dropTargetChapterId, setDropTargetChapterId] = useState<
    string | null
  >(null);

  const totalWords = chapters.reduce(
    (sum, ch) => sum + countWords(ch.content),
    0
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Header ── */}
      <div className="border-b border-black/[0.06] px-4 py-3.5 dark:border-white/[0.06]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Chapters
          </h2>
          <span className="text-[11px] text-slate-400 dark:text-white/35">
            {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
            {totalWords > 0 && (
              <>
                <span className="mx-1 text-slate-300 dark:text-white/15">
                  ·
                </span>
                {totalWords.toLocaleString()} words
              </>
            )}
          </span>
        </div>
      </div>

      {/* ── Chapter list ── */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {chapters.length === 0 ? (
          <div className="flex h-full min-h-[220px] items-center justify-center px-5 text-center text-sm text-slate-500 dark:text-white/45">
            Create your first chapter to start writing.
          </div>
        ) : (
          <div>
            {chapters.map((chapter, index) => {
              const isActive = chapter.id === selectedChapterId;
              const words = countWords(chapter.content);
              const isEmpty = words === 0;
              const isDragTarget =
                dropTargetChapterId === chapter.id &&
                draggingChapterId !== chapter.id;

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
                  className={`group transition ${
                    draggingChapterId === chapter.id ? "opacity-50" : ""
                  }`}
                >
                  <div
                    className={`flex items-center border-l-2 transition ${
                      isDragTarget
                        ? "border-l-[#907AFF] bg-[#907AFF]/[0.04] dark:bg-[#907AFF]/[0.06]"
                        : isActive
                          ? "border-l-slate-900 bg-slate-50 dark:border-l-white dark:bg-white/[0.06]"
                          : "border-l-transparent hover:bg-slate-50/80 dark:hover:bg-white/[0.03]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectChapter(chapter.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-3.5 py-2"
                    >
                      {/* Chapter number — subtle, no badge */}
                      <span
                        className={`w-4 shrink-0 text-right text-[11px] tabular-nums ${
                          isActive
                            ? "font-semibold text-slate-900 dark:text-white"
                            : "font-medium text-slate-300 dark:text-white/20"
                        }`}
                      >
                        {index + 1}
                      </span>

                      {/* Title — primary text */}
                      <span
                        className={`min-w-0 flex-1 truncate text-[13px] ${
                          isActive
                            ? "font-semibold text-slate-900 dark:text-white"
                            : "font-medium text-slate-700 dark:text-white/70"
                        }`}
                      >
                        {chapter.title || `Chapter ${index + 1}`}
                      </span>

                      {/* Word count — right-aligned secondary */}
                      <span
                        className={`shrink-0 text-[11px] tabular-nums ${
                          isEmpty
                            ? isActive
                              ? "text-slate-400 dark:text-white/30"
                              : "text-slate-300 dark:text-white/20"
                            : isActive
                              ? "font-medium text-slate-500 dark:text-white/45"
                              : "text-slate-400 dark:text-white/35"
                        }`}
                      >
                        {formatWordCount(words)}
                      </span>
                    </button>

                    {/* Drag / reorder — visible on hover */}
                    <div className="flex shrink-0 items-center pr-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <span
                        aria-hidden="true"
                        className={`cursor-grab text-[11px] leading-none ${
                          isActive
                            ? "text-slate-400 dark:text-white/30"
                            : "text-slate-300 dark:text-white/15"
                        }`}
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create chapter ── */}
      <div className="border-t border-black/[0.06] px-4 py-3 dark:border-white/[0.06]">
        <button
          type="button"
          onClick={onCreateChapter}
          disabled={isCreating}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-white/10 dark:text-white/45 dark:hover:border-white/20 dark:hover:bg-white/[0.03] dark:hover:text-white/70"
        >
          {isCreating ? "Creating..." : "+ New chapter"}
        </button>
      </div>
    </div>
  );
}
