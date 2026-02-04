import Link from "next/link";

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
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.08)] transition-transform duration-200 group-hover:-translate-y-1 dark:border-white/10 dark:bg-white/5 dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          <div className="aspect-[3/4] w-full overflow-hidden">
            {cover ? (
              <img
                src={cover}
                alt={title ?? "Book cover"}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200/70 via-white to-slate-100 dark:from-white/10 dark:via-white/5 dark:to-slate-900/60">
                <span className="text-[12px] font-medium text-slate-500 dark:text-white/60">No cover</span>
              </div>
            )}
          </div>
          {tag && (
            <span className="absolute left-3 top-3 rounded-full border border-white/60 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/90 dark:text-white/80">
              {tag}
            </span>
          )}
          {hasProgress && !showCta && (
            <div className="absolute inset-x-3 bottom-3">
              <div className="h-1.5 w-full rounded-full bg-white/70 dark:bg-white/20">
                <div
                  className="h-full rounded-full bg-slate-900/90 dark:bg-white"
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
                  <span className="text-[11px] font-medium text-slate-500 dark:text-white/70">
                    {Math.round(clampedProgress)}%
                  </span>
                )}
              </div>
              {hasProgress && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-white/70 dark:bg-white/20">
                  <div
                    className="h-full rounded-full bg-slate-900/90 dark:bg-white"
                    style={{ width: `${clampedProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 space-y-1">
          <h3 className="text-[14px] font-semibold text-slate-900 group-hover:text-[#7058DD] dark:text-white dark:group-hover:text-[#B8A8FF] truncate">
            {title ?? "Untitled"}
          </h3>
          <p className="text-[12px] text-slate-500 dark:text-white/60 truncate">
            {author ?? "Unknown author"}
          </p>
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
