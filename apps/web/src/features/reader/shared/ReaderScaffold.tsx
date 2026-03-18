import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookMarked, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

type ReaderSectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
};

type ReaderHeroPanelProps = {
  eyebrow?: string;
  title: string;
  description: string;
  cover?: string | null;
  coverAlt?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

type ReaderContextCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

type ReaderContinueCardProps = {
  title: string;
  author: string;
  href: string;
  cover?: string | null;
  progress: number;
  chapterLabel?: string | null;
  lastOpenedLabel?: string | null;
};

type ReaderEmptyBlockProps = {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
};

function CoverArt({
  cover,
  alt,
  className,
}: {
  cover?: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-black/[0.08] bg-[radial-gradient(circle_at_top,_rgba(144,122,255,0.16),_rgba(255,255,255,0.95)_55%,_rgba(15,23,42,0.02)_100%)] shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top,_rgba(144,122,255,0.2),_rgba(15,23,42,0.92)_58%,_rgba(15,23,42,0.84)_100%)]",
        className
      )}
    >
      {cover ? (
        <Image
          src={cover}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 220px, 280px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(144,122,255,0.22),_rgba(255,255,255,0.92)_55%,_rgba(15,23,42,0.04)_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(144,122,255,0.24),_rgba(15,23,42,0.82)_58%,_rgba(15,23,42,0.74)_100%)]">
          <BookMarked className="h-8 w-8 text-slate-400 dark:text-white/40" />
        </div>
      )}
    </div>
  );
}

export function ReaderSectionHeader({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  className,
}: ReaderSectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="space-y-2">
        {eyebrow ? <p className="text-eyebrow">{eyebrow}</p> : null}
        <h2 className="text-section-title">{title}</h2>
        {description ? <p className="max-w-2xl text-body">{description}</p> : null}
      </div>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="btn-ghost self-start sm:self-auto">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function ReaderHeroPanel({
  eyebrow,
  title,
  description,
  cover,
  coverAlt,
  actions,
  children,
  className,
}: ReaderHeroPanelProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[32px] border border-black/[0.06] bg-[radial-gradient(circle_at_top_left,_rgba(144,122,255,0.16),_rgba(255,255,255,0.96)_38%,_rgba(250,250,252,0.98)_100%)] px-5 py-6 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.28)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,_rgba(144,122,255,0.18),_rgba(15,23,42,0.94)_40%,_rgba(2,6,23,0.98)_100%)] sm:px-7 sm:py-8 lg:px-8 lg:py-9",
        className
      )}
    >
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
        <div className="max-w-[240px]">
          <div className="aspect-[3/4]">
            <CoverArt cover={cover} alt={coverAlt ?? title} className="h-full w-full" />
          </div>
        </div>
        <div className="space-y-5">
          {eyebrow ? <p className="text-eyebrow">{eyebrow}</p> : null}
          <div className="space-y-3">
            <h1 className="text-[34px] font-semibold tracking-tight text-slate-950 dark:text-white sm:text-[42px]">
              {title}
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-white/65">
              {description}
            </p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
          {children ? <div className="grid gap-3 sm:grid-cols-2">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function ReaderContextCard({
  title,
  description,
  children,
  className,
}: ReaderContextCardProps) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-black/[0.06] bg-white/88 p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.32)] dark:border-white/10 dark:bg-white/[0.04]",
        className
      )}
    >
      <div className="space-y-1">
        <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">{title}</h3>
        {description ? <p className="text-helper">{description}</p> : null}
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function ReaderContinueCard({
  title,
  author,
  href,
  cover,
  progress,
  chapterLabel,
  lastOpenedLabel,
}: ReaderContinueCardProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <Link
      href={href}
      className="group min-w-[320px] rounded-[28px] border border-black/[0.06] bg-white/92 p-4 shadow-[0_22px_54px_-42px_rgba(15,23,42,0.34)] transition hover:-translate-y-0.5 hover:border-black/[0.1] hover:shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/[0.05] dark:hover:border-white/20"
    >
      <div className="flex items-start gap-4">
        <div className="h-[112px] w-[82px] flex-shrink-0">
          <CoverArt cover={cover} alt={title} className="h-full w-full rounded-[22px]" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="truncate text-[16px] font-semibold text-slate-950 transition group-hover:text-[#7058DD] dark:text-white dark:group-hover:text-[#b8a8ff]">
              {title}
            </p>
            <p className="truncate text-[13px] text-slate-500 dark:text-white/55">{author}</p>
          </div>
          <div className="space-y-2">
            {chapterLabel ? (
              <p className="truncate text-[13px] text-slate-600 dark:text-white/65">{chapterLabel}</p>
            ) : null}
            {lastOpenedLabel ? (
              <div className="flex items-center gap-2 text-[12px] text-slate-400 dark:text-white/40">
                <Clock3 className="h-3.5 w-3.5" />
                <span>{lastOpenedLabel}</span>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-slate-900 dark:bg-white"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[12px] font-medium">
              <span className="text-slate-500 dark:text-white/50">{Math.round(clampedProgress)}% complete</span>
              <span className="inline-flex items-center gap-1 text-slate-900 dark:text-white">
                Resume
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function ReaderEmptyBlock({
  title,
  description,
  actionHref,
  actionLabel,
  className,
}: ReaderEmptyBlockProps) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-dashed border-black/[0.08] bg-white/65 px-5 py-6 dark:border-white/10 dark:bg-white/[0.03]",
        className
      )}
    >
      <div className="space-y-2">
        <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">{title}</h3>
        <p className="max-w-xl text-body">{description}</p>
      </div>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="btn-primary mt-4">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
