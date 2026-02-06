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
          <div className="aspect-[3/4] rounded-2xl bg-slate-200 dark:bg-white/10" />
          <div className="h-3.5 w-3/4 rounded-full bg-slate-200 dark:bg-white/10" />
          <div className="h-3 w-1/2 rounded-full bg-slate-200 dark:bg-white/10" />
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
        className="block rounded-2xl focus-ring"
      >
        {/* Cover Image Container */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_8px_24px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-white/5 dark:shadow-[0_4px_16px_rgba(0,0,0,0.25)] dark:group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          <div className="aspect-[3/4] w-full overflow-hidden">
            {cover ? (
              <img
                src={cover}
                alt={title ?? "Book cover"}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-verkli-primary/20 via-verkli-secondary/15 to-verkli-accent/20">
                <span className="text-label">No cover</span>
              </div>
            )}
          </div>

          {/* Tag Badge */}
          {tag && (
            <span className="badge-secondary absolute left-3 top-3 shadow-sm">
              {tag}
            </span>
          )}

          {/* Progress Bar (without CTA) */}
          {hasProgress && !showCta && (
            <div className="absolute inset-x-3 bottom-3">
              <div className="h-1.5 w-full rounded-full bg-white/70 dark:bg-white/20">
                <div
                  className="h-full rounded-full bg-verkli-primary transition-all duration-500"
                  style={{ width: `${clampedProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* CTA with Progress */}
          {showCta && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3">
              <div className="flex items-center justify-between gap-2 rounded-full border border-white/60 bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-900 shadow-sm backdrop-blur-sm dark:border-white/15 dark:bg-slate-950/80 dark:text-white">
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
                    className="h-full rounded-full bg-verkli-primary transition-all duration-500"
                    style={{ width: `${clampedProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Book Info */}
        <div className="mt-3 space-y-1">
          <h3 className="text-card-title truncate transition-colors group-hover:text-verkli-primary">
            {title ?? "Untitled"}
          </h3>
          <p className="text-helper truncate">
            {author ?? "Unknown author"}
          </p>
          {(rating || length) && (
            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-white/60">
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
