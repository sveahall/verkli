import Link from "next/link";
import Image from "next/image";
import { Play } from "lucide-react";
import ProBadge from "@/components/billing/ProBadge";

const sizeStyles = {
  sm: "w-32 sm:w-36",
  md: "w-36 sm:w-40",
  lg: "w-40 sm:w-44",
};

type BookCardProps = {
  id?: string;
  title?: string;
  author?: string;
  authorIsPro?: boolean;
  genre?: string;
  cover?: string | null;
  href?: string;
  tag?: string;
  rating?: number;
  length?: string;
  progress?: number;
  ctaLabel?: string;
  hasTrailer?: boolean;
  size?: keyof typeof sizeStyles;
  isSkeleton?: boolean;
  layout?: "rail" | "grid";
  className?: string;
};

export default function BookCard({
  id,
  title,
  author,
  authorIsPro,
  genre,
  cover,
  href,
  tag,
  rating,
  length,
  progress,
  ctaLabel,
  hasTrailer,
  size = "md",
  isSkeleton,
  layout = "rail",
  className,
}: BookCardProps) {
  const resolvedHref = href ?? (id ? `/reader/books/${id}` : "#");
  const containerClass =
    layout === "grid"
      ? `w-full ${className ?? ""}`.trim()
      : `flex-shrink-0 ${sizeStyles[size]} ${className ?? ""}`.trim();

  if (isSkeleton) {
    return (
      <div className={`group ${containerClass}`}>
        <div className="animate-pulse space-y-3">
          <div className="aspect-[3/4] rounded-2xl border border-slate-200/70 bg-slate-200/60 dark:border-white/10 dark:bg-white/10" />
          <div className="h-3 w-3/4 rounded-full bg-slate-200/80 dark:bg-white/10" />
          <div className="h-3 w-1/2 rounded-full bg-slate-200/80 dark:bg-white/10" />
        </div>
      </div>
    );
  }

  const hasProgress = typeof progress === "number";
  const clampedProgress = hasProgress ? Math.min(Math.max(progress, 0), 100) : 0;
  const showCta = Boolean(ctaLabel);

  return (
    <div className={`group ${containerClass}`}>
      <Link
        href={resolvedHref}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0b0b12]"
      >
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-[#907AFF]/20 group-hover:shadow-[0_20px_40px_-12px_rgba(144,122,255,0.15),0_8px_16px_-4px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5 dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)] dark:group-hover:border-[#907AFF]/20 dark:group-hover:shadow-[0_20px_40px_-12px_rgba(144,122,255,0.12),0_8px_16px_-4px_rgba(0,0,0,0.3)]">
          <div className="relative aspect-[3/4] w-full overflow-hidden">
            {cover ? (
              <Image
                src={cover}
                alt={title ?? "Book cover"}
                fill
                sizes="(min-width: 640px) 176px, 144px"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/10 via-white to-slate-100 dark:from-[#907AFF]/15 dark:via-white/5 dark:to-slate-900/60">
                <span className="text-[12px] font-medium text-slate-400 dark:text-white/50">No cover</span>
              </div>
            )}
            {/* Subtle gradient overlay at bottom for depth */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/[0.06] to-transparent dark:from-black/20" />
          </div>
          {tag && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-[#907AFF]/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm dark:bg-[#907AFF]/80">
              {tag}
            </span>
          )}
          {hasTrailer && (
            <span className="absolute right-2 top-2 rounded-full bg-slate-900/70 p-1.5 text-white backdrop-blur-sm dark:bg-white/20">
              <Play className="h-3 w-3 fill-current" />
            </span>
          )}
          {hasProgress && !showCta && (
            <div className="absolute inset-x-3 bottom-3">
              <div className="h-1.5 w-full rounded-full bg-white/60 backdrop-blur-sm dark:bg-white/20">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#907AFF] to-[#E29ED5]"
                  style={{ width: `${clampedProgress}%` }}
                />
              </div>
            </div>
          )}
          {showCta && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3">
              <div className="flex items-center justify-between gap-2 rounded-full border border-white/60 bg-white/90 px-3 py-2 text-[11px] font-semibold text-slate-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/70 dark:text-white">
                <span>{ctaLabel}</span>
                {hasProgress && (
                  <span className="text-[11px] font-medium text-[#907AFF]">
                    {Math.round(clampedProgress)}%
                  </span>
                )}
              </div>
              {hasProgress && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-white/60 backdrop-blur-sm dark:bg-white/20">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#907AFF] to-[#E29ED5]"
                    style={{ width: `${clampedProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 space-y-1">
          <h3 className="truncate text-[14px] font-semibold text-slate-900 transition-colors group-hover:text-[#907AFF] dark:text-white dark:group-hover:text-[#B8A8FF]">
            {title ?? "Untitled"}
          </h3>
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-white/60">
            <span className="truncate">{author ?? "Unknown author"}</span>
            {authorIsPro && <ProBadge size="sm" shimmer={false} className="flex-shrink-0" />}
            {genre && (
              <span className="flex-shrink-0 before:mx-1 before:text-slate-300 before:content-['·'] before:dark:text-white/20">
                {genre}
              </span>
            )}
          </div>
          {(rating || length) && (
            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-white/55">
              {rating && <span>★ {rating.toFixed(1)}</span>}
              {rating && length && <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-white/30" />}
              {length && <span>{length}</span>}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
