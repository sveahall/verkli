"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

type NavChapter = {
  id: string;
  title: string;
  order: number;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

export default function ChapterTopNavigator({
  chapters,
  currentChapterId,
}: {
  chapters: NavChapter[];
  currentChapterId: string;
}) {
  const router = useRouter();

  const currentIndex = useMemo(
    () => chapters.findIndex((chapter) => chapter.id === currentChapterId),
    [chapters, currentChapterId]
  );
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const total = chapters.length;
  const currentChapter = chapters[safeIndex] ?? null;
  const previousChapter = safeIndex > 0 ? chapters[safeIndex - 1] : null;
  const nextChapter = safeIndex < total - 1 ? chapters[safeIndex + 1] : null;
  const previousChapterId = previousChapter?.id ?? null;
  const nextChapterId = nextChapter?.id ?? null;
  const progressPercent = total > 0 ? Math.round(((safeIndex + 1) / total) * 100) : 0;
  const displayIndex = total > 0 ? safeIndex + 1 : 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "ArrowRight" && nextChapterId) {
        event.preventDefault();
        router.push(`/reader/read/${nextChapterId}`);
      }
      if (event.key === "ArrowLeft" && previousChapterId) {
        event.preventDefault();
        router.push(`/reader/read/${previousChapterId}`);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextChapterId, previousChapterId, router]);

  return (
    <div className="sticky top-4 z-30 rounded-[24px] border border-slate-200/90 bg-white/95 px-5 py-4 shadow-[0_14px_36px_rgba(15,23,42,0.09)] backdrop-blur dark:border-white/10 dark:bg-[#0b0e14]/85">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => previousChapter && router.push(`/reader/read/${previousChapter.id}`)}
          disabled={!previousChapter}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:bg-white/[0.06] dark:text-white/80 dark:hover:bg-white/10"
          aria-label="Previous chapter"
        >
          ←
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">
              {currentChapter ? `${displayIndex}. ${currentChapter.title}` : "Chapter"}
            </p>
            <span className="whitespace-nowrap text-[11px] font-medium text-slate-500 dark:text-white/50">
              {displayIndex} / {total} • {progressPercent}%
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8B7BFF] via-[#6E8BFF] to-[#56C8B3] shadow-[0_0_0_1px_rgba(255,255,255,0.24)_inset] transition-all duration-300"
              style={{ width: `${Math.max(progressPercent, total > 0 ? 3 : 0)}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => nextChapter && router.push(`/reader/read/${nextChapter.id}`)}
          disabled={!nextChapter}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:bg-white/[0.06] dark:text-white/80 dark:hover:bg-white/10"
          aria-label="Next chapter"
        >
          →
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <label htmlFor="chapter-jump" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-white/50">
          Jump
        </label>
        <select
          id="chapter-jump"
          value={currentChapterId}
          onChange={(event) => router.push(`/reader/read/${event.target.value}`)}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-[#8B7BFF]/50 focus:ring-2 focus:ring-[#8B7BFF]/20 dark:border-white/15 dark:bg-white/[0.05] dark:text-white"
        >
          {chapters.map((chapter, index) => (
            <option key={chapter.id} value={chapter.id}>
              {index + 1}. {chapter.title}
            </option>
          ))}
        </select>
        <span className="hidden text-[11px] text-slate-500 dark:text-white/50 sm:inline">
          ⌨︎ ← / →
        </span>
      </div>
    </div>
  );
}
