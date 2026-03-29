import Link from "next/link";
import Image from "next/image";
import { BookMarked } from "lucide-react";

const sizeStyles = {
  sm: "w-32 sm:w-36",
  md: "w-36 sm:w-40",
  lg: "w-40 sm:w-44",
};

type BookCardProps = {
  id?: string;
  title?: string;
  author?: string;
  cover?: string | null;
  href?: string;
  tag?: string;
  rating?: number;
  length?: string;
  progress?: number;
  ctaLabel?: string;
  size?: keyof typeof sizeStyles;
  isSkeleton?: boolean;
  layout?: "rail" | "grid";
  className?: string;
};

export default function BookCard({
  id,
  title,
  author,
  cover,
  href,
  tag,
  rating,
  length,
  progress,
  ctaLabel,
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
        <div className="animate-pulse space-y-2">
          <div className="aspect-[3/4] rounded-xl border border-black/[0.06] bg-[#F8F9FB] dark:border-white/[0.06] dark:bg-white/10" />
          <div className="h-3 w-3/4 rounded-full bg-[#F8F9FB] dark:bg-white/10" />
          <div className="h-3 w-1/2 rounded-full bg-[#F8F9FB] dark:bg-white/10" />
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
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2"
      >
        <div className="relative overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-sm transition-[transform,box-shadow] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-y-1 group-hover:shadow-md group-active:scale-[0.97] dark:border-white/[0.06] dark:bg-white/5">
          <div className="relative aspect-[3/4] w-full overflow-hidden">
            {cover ? (
              <Image
                src={cover}
                alt={title ?? "Book cover"}
                fill
                sizes="(min-width: 640px) 176px, 144px"
                className="object-cover transition-transform duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-hover:scale-105"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#F8F9FB] dark:bg-white/10">
                <BookMarked className="h-6 w-6 text-[#907AFF]/30" />
              </div>
            )}
          </div>
          {tag && (
            <span className="absolute left-2 top-2 rounded-xl bg-[#907AFF] px-2 py-1 text-xs font-semibold text-white">
              {tag}
            </span>
          )}
          {hasProgress && !showCta && (
            <div className="absolute inset-x-2 bottom-2">
              <div className="h-1.5 w-full rounded-full bg-white/60 dark:bg-white/20">
                <div
                  className="h-full rounded-full bg-[#907AFF]"
                  style={{ width: `${clampedProgress}%` }}
                />
              </div>
            </div>
          )}
          {showCta && (
            <div className="pointer-events-none absolute inset-x-2 bottom-2">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-white/90 px-2 py-1.5 text-xs font-semibold text-[#0F172A] dark:border-white/[0.06] dark:bg-white/80 dark:text-[#0F172A]">
                <span>{ctaLabel}</span>
                {hasProgress && (
                  <span className="text-xs font-medium text-[#907AFF]">
                    {Math.round(clampedProgress)}%
                  </span>
                )}
              </div>
              {hasProgress && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-white/60 dark:bg-white/20">
                  <div
                    className="h-full rounded-full bg-[#907AFF]"
                    style={{ width: `${clampedProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-2 space-y-1">
          <h3 className="truncate text-sm font-semibold text-[#0F172A] transition-colors group-hover:text-[#907AFF] dark:text-white">
            {title ?? "Untitled"}
          </h3>
          <p className="truncate text-xs text-[#64748B] dark:text-white/60">
            {author ?? "Unknown author"}
          </p>
          {(rating || length) && (
            <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-white/55">
              {rating && <span>★ {rating.toFixed(1)}</span>}
              {rating && length && <span className="h-1 w-1 rounded-full bg-[#64748B]/30" />}
              {length && <span>{length}</span>}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
