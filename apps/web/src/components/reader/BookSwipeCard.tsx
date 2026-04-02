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
      className={`flex-shrink-0 w-48 rounded-2xl border transition-all ${
        signal === "like"
          ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10"
          : signal === "skip"
            ? "border-slate-300 bg-slate-50 opacity-60 dark:border-white/10 dark:bg-white/5"
            : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5"
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
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200/70 via-white to-slate-100 dark:from-white/10 dark:via-white/5 dark:to-slate-900/60">
            <span className="text-[12px] font-medium text-slate-500 dark:text-white/60">
              No cover
            </span>
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
          {title}
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-white/60 truncate">
          {author}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSkip(id)}
            className={`flex-1 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
              signal === "skip"
                ? "border-slate-400 bg-slate-200 text-slate-700 dark:border-white/30 dark:bg-white/20 dark:text-white"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
            }`}
          >
            Skippa
          </button>
          <button
            type="button"
            onClick={() => onLike(id)}
            className={`flex-1 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
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
