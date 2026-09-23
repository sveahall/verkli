import Link from "next/link";
import Image from "next/image";
import { Play } from "lucide-react";

const sizeStyles = {
  sm: "w-32 sm:w-36",
  md: "w-36 sm:w-40",
  lg: "w-40 sm:w-44",
};

type BookCardProps = {
  id?: string;
  title?: string;
  author?: string;
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
        <div className="motion-safe:animate-pulse space-y-3">
          <div className="aspect-[3/4] rounded-2xl border border-border bg-muted/60 dark:bg-card" />
          <div className="h-3 w-3/4 rounded-full bg-muted/80 dark:bg-card" />
          <div className="h-3 w-1/2 rounded-full bg-muted/80 dark:bg-card" />
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
        className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:focus-visible:ring-offset-background"
      >
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-[background-color,border-color,color,box-shadow] duration-200 group-hover:border-[#907AFF]/20 group-hover:shadow-[0_20px_40px_-12px_rgba(144,122,255,0.15),0_8px_16px_-4px_rgba(15,23,42,0.06)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)] dark:group-hover:border-[#907AFF]/20 dark:group-hover:shadow-[0_20px_40px_-12px_rgba(144,122,255,0.12),0_8px_16px_-4px_rgba(0,0,0,0.3)]">
          <div className="relative aspect-[3/4] w-full overflow-hidden">
            {cover ? (
              <Image
                src={cover}
                alt={title ?? "Book cover"}
                fill
                sizes="(min-width: 640px) 176px, 144px"
                className="object-cover transition-transform duration-500"
              />
            ) : (
              /* No-cover fallback: typeset the title over the brand wash so the
                 card reads as a deliberate "text cover", not a missing asset. */
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#907AFF]/[0.16] via-[#E29ED5]/[0.10] to-[#FCC997]/[0.20] p-4 dark:from-[#907AFF]/25 dark:via-[#E29ED5]/10 dark:to-[#FCC997]/15">
                <div
                  aria-hidden
                  className="absolute inset-x-4 top-4 h-px bg-gradient-to-r from-transparent via-[#907AFF]/30 to-transparent"
                />
                <span className="line-clamp-4 text-center font-display text-[15px] font-medium leading-snug tracking-tight text-foreground">
                  {title ?? "Untitled"}
                </span>
                <div
                  aria-hidden
                  className="absolute inset-x-4 bottom-4 h-px bg-gradient-to-r from-transparent via-[#907AFF]/30 to-transparent"
                />
              </div>
            )}
            {/* Subtle gradient overlay at bottom for depth */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/[0.06] to-transparent dark:from-black/20" />
          </div>
          {tag && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-background shadow-sm backdrop-blur-sm">
              {tag}
            </span>
          )}
          {hasTrailer && (
            <span className="absolute right-2 top-2 rounded-full bg-foreground/70 p-1.5 text-background backdrop-blur-sm dark:bg-foreground/80">
              <Play className="h-3 w-3 fill-current" />
            </span>
          )}
          {hasProgress && !showCta && (
            <div className="absolute inset-x-3 bottom-3">
              <div className="h-1.5 w-full rounded-full bg-card/60 backdrop-blur-sm dark:bg-card">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#907AFF] to-[#E29ED5]"
                  style={{ width: `${clampedProgress}%` }}
                />
              </div>
            </div>
          )}
          {showCta && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3">
              <div className="flex items-center justify-between gap-2 rounded-full border border-white/60 bg-card/90 px-3 py-2 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur dark:border-border dark:bg-card/70">
                <span>{ctaLabel}</span>
                {hasProgress && (
                  <span className="text-[11px] font-medium text-accent-foreground">
                    {Math.round(clampedProgress)}%
                  </span>
                )}
              </div>
              {hasProgress && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-card/60 backdrop-blur-sm dark:bg-card">
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
          <h3 className="truncate text-[14px] font-medium text-foreground transition-colors group-hover:text-accent-foreground dark:group-hover:text-accent-foreground font-display">
            {title ?? "Untitled"}
          </h3>
          <p className="truncate text-[12px] text-muted-foreground">
            {author ?? "Unknown author"}
            {genre && (
              <span className="before:mx-1 before:content-['·'] before:text-muted-foreground before:dark:text-muted-foreground">
                {genre}
              </span>
            )}
          </p>
          {(rating || length) && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {rating && <span>★ {rating.toFixed(1)}</span>}
              {rating && length && <span className="h-1 w-1 rounded-full bg-muted dark:bg-card" />}
              {length && <span>{length}</span>}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
