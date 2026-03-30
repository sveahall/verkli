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
        "overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(ellipse_at_top_left,rgba(144,122,255,0.14),rgba(255,255,255,0.96)_30%,rgba(226,158,213,0.08)_60%,rgba(252,201,151,0.08)_100%)] px-5 py-6 shadow-[0_10px_32px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[radial-gradient(ellipse_at_top_left,rgba(144,122,255,0.2),rgba(255,255,255,0.04)_30%,rgba(226,158,213,0.06)_60%,rgba(252,201,151,0.06)_100%)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.28)] sm:px-7 sm:py-7 lg:px-8 lg:py-8",
        className
      )}
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
        <div className="order-2 space-y-4 lg:order-1">
          {eyebrow ? <p className="text-eyebrow">{eyebrow}</p> : null}
          <div className="space-y-3">
            <h1 className="text-[32px] font-semibold tracking-tight text-slate-950 dark:text-white sm:text-[38px]">
              {title}
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-white/65">
              {description}
            </p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
          {children ? <div className="flex flex-wrap gap-3">{children}</div> : null}
        </div>
        <div className="order-1 lg:order-2">
          <div className="rounded-[28px] border border-white/70 bg-white/70 p-4 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.2)] transition-transform duration-500 hover:scale-[1.02] dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mx-auto max-w-[188px]">
              <div className="aspect-[3/4]">
                <CoverArt cover={cover} alt={coverAlt ?? title} className="h-full w-full rounded-[24px]" />
              </div>
            </div>
          </div>
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
        "rounded-[28px] border border-black/[0.06] bg-white/88 p-5 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-white/[0.04]",
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
      className="card-base group min-w-[320px] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(15,23,42,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 dark:hover:shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
    >
      <div className="flex items-start gap-4">
        <div className="relative h-[112px] w-[82px] flex-shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-white/10">
          {cover ? (
            <Image src={cover} alt={title} fill sizes="82px" className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <BookMarked className="h-5 w-5 text-slate-300 dark:text-white/25" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="truncate text-[16px] font-semibold text-slate-950 transition-colors group-hover:text-[#907AFF] dark:text-white dark:group-hover:text-[#b8a8ff]">
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
            <div className="h-[6px] overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#907AFF] to-[#E29ED5] transition-all duration-500"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[12px] font-medium">
              <span className="text-slate-500 dark:text-white/50">{Math.round(clampedProgress)}% complete</span>
              <span className="inline-flex items-center gap-1 text-[#907AFF] transition-colors group-hover:text-[#7058DD] dark:text-[#b8a8ff] dark:group-hover:text-[#c7baff]">
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
        "rounded-[24px] border border-dashed border-slate-200/80 bg-white/60 px-5 py-6 dark:border-white/[0.08] dark:bg-white/[0.02]",
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
