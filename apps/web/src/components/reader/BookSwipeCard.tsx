"use client";

import Image from "next/image";

interface BookSwipeCardProps {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  onLike: (bookId: string) => void;
  onSkip: (bookId: string) => void;
  signal?: "like" | "skip" | null;
}

export default function BookSwipeCard({
  id,
  title,
  author,
  cover,
  onLike,
  onSkip,
  signal,
}: BookSwipeCardProps) {
  return (
    <div
      className={`flex-shrink-0 w-48 rounded-2xl border transition-[background-color,border-color,color,box-shadow] ${
        signal === "like"
          ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10"
          : signal === "skip"
            ? "border-border bg-muted opacity-60 dark:bg-card"
            : "border-border bg-card "
      }`}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-2xl">
        {cover ? (
          <Image
            src={cover}
            alt={title}
            fill
            sizes="192px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/15 via-[#E29ED5]/10 to-[#FCC997]/20 p-5">
            <span className="font-display text-center text-base leading-relaxed text-foreground">
              {title}
            </span>
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <h3 className="text-[13px] font-medium text-foreground truncate font-display">
          {title}
        </h3>
        <p className="text-[11px] text-muted-foreground truncate">
          {author}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={signal === "skip"}
            onClick={() => onSkip(id)}
            className={`min-h-11 flex-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              signal === "skip"
                ? "border-border bg-muted text-foreground dark:bg-card "
                : "border-border bg-muted text-muted-foreground hover:bg-muted dark:bg-card dark:hover:bg-card"
            }`}
          >
            Skippa
          </button>
          <button
            type="button"
            aria-pressed={signal === "like"}
            onClick={() => onLike(id)}
            className={`min-h-11 flex-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              signal === "like"
                ? "border-emerald-400 bg-emerald-100 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-500/20 dark:text-emerald-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
            }`}
          >
            Gilla
          </button>
        </div>
      </div>
    </div>
  );
}
