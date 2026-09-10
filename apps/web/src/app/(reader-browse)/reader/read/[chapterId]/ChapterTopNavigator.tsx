"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  disableNext = false,
}: {
  chapters: NavChapter[];
  currentChapterId: string;
  disableNext?: boolean;
}) {
  const router = useRouter();
  const [showJump, setShowJump] = useState(false);

  const currentIndex = useMemo(
    () => chapters.findIndex((chapter) => chapter.id === currentChapterId),
    [chapters, currentChapterId]
  );
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const total = chapters.length;
  const currentChapter = chapters[safeIndex] ?? null;
  const previousChapter = safeIndex > 0 ? chapters[safeIndex - 1] : null;
  const nextChapter = !disableNext && safeIndex < total - 1 ? chapters[safeIndex + 1] : null;
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
    <div className="sticky top-[64px] z-30">
      <div className="rounded-xl border border-black/[0.06] bg-card/95 px-3 py-2.5 shadow-sm backdrop-blur-lg dark:border-border dark:bg-card/95">
        <div className="flex items-center gap-2">
          {/* Prev button */}
          <button
            type="button"
            onClick={() => previousChapter && router.push(`/reader/read/${previousChapter.id}`)}
            disabled={!previousChapter}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm transition-[background-color,border-color,color,box-shadow] duration-200 ${
              previousChapter
                ? "border-black/[0.06] text-foreground hover:border-[#907AFF]/30 hover:text-accent-foreground active:scale-95 dark:border-border dark:hover:border-[#907AFF]/30"
                : "pointer-events-none border-transparent text-muted-foreground/30 dark:text-muted-foreground"
            }`}
            aria-label="Previous chapter"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {/* Chapter info + progress */}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setShowJump((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2"
            >
              <span className="truncate text-sm font-medium text-foreground">
                {currentChapter ? currentChapter.title : "Chapter"}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {displayIndex} of {total}
              </span>
            </button>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-black/[0.06] dark:bg-card">
              <div
                className="h-full rounded-full bg-[#907AFF] transition-[background-color,border-color,color,box-shadow] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
                style={{ width: `${Math.max(progressPercent, total > 0 ? 2 : 0)}%` }}
              />
            </div>
          </div>

          {/* Next button */}
          <button
            type="button"
            onClick={() => nextChapter && router.push(`/reader/read/${nextChapter.id}`)}
            disabled={!nextChapter}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm transition-[background-color,border-color,color,box-shadow] duration-200 ${
              nextChapter
                ? "border-black/[0.06] text-foreground hover:border-[#907AFF]/30 hover:text-accent-foreground active:scale-95 dark:border-border dark:hover:border-[#907AFF]/30"
                : "pointer-events-none border-transparent text-muted-foreground/30 dark:text-muted-foreground"
            }`}
            aria-label="Next chapter"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {showJump && (
          <div className="mt-2 border-t border-black/[0.06] pt-2 dark:border-border">
            <select
              id="chapter-jump"
              value={currentChapterId}
              onChange={(event) => {
                router.push(`/reader/read/${event.target.value}`);
                setShowJump(false);
              }}
              className="w-full rounded-xl border border-black/[0.06] bg-card px-3 py-2 text-[16px] sm:text-sm text-foreground outline-none transition focus:border-[#907AFF]/40 focus:ring-2 focus:ring-[#907AFF]/15 dark:border-border"
            >
              {chapters.map((chapter, index) => (
                <option key={chapter.id} value={chapter.id}>
                  {index + 1}. {chapter.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
