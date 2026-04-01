import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type ReaderBookPageViewProps = {
  backHref: string;
  title: string;
  authorName: string;
  authorHref: string;
  cover: React.ReactNode;
  followAction?: React.ReactNode;
  metaChips: React.ReactNode;
  languageSwitcher?: React.ReactNode;
  description: string;
  notices?: React.ReactNode;
  actionBar: React.ReactNode;
  utilityBar?: React.ReactNode;
  editionNotes: Array<{ label: string; value: string }>;
  chaptersSection: React.ReactNode;
  podSection?: React.ReactNode;
  relatedSection?: React.ReactNode;
  reviewsSection: React.ReactNode;
  commentsSection: React.ReactNode;
};

export default function ReaderBookPageView({
  backHref,
  title,
  authorName,
  authorHref,
  cover,
  followAction,
  metaChips,
  languageSwitcher,
  description,
  notices,
  actionBar,
  utilityBar,
  editionNotes,
  chaptersSection,
  podSection,
  relatedSection,
  reviewsSection,
  commentsSection,
}: ReaderBookPageViewProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pb-16 pt-2 sm:px-6">
      {/* ── Back link ── */}
      <header>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-400 transition-colors duration-150 ease-out hover:text-slate-700 dark:text-white/40 dark:hover:text-white/80"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to discover
        </Link>
      </header>

      {/* ── Hero card ── */}
      <div className="relative overflow-hidden rounded-2xl border border-black/[0.05] bg-white/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.03] dark:shadow-none">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-[320px] w-[320px] rounded-full bg-[#907AFF]/[0.07] blur-[100px]" />

        <div className="relative grid gap-6 p-4 sm:gap-8 sm:p-6 md:p-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          {/* Cover */}
          <div className="relative mx-auto w-full max-w-[200px] sm:max-w-[260px] lg:mx-0">
            <div className="absolute inset-4 rounded-2xl bg-[#907AFF]/10 blur-2xl" />
            <div className="relative">{cover}</div>
          </div>

          {/* Info */}
          <div className="space-y-5">
            <div className="space-y-3">
              {/* Author + follow */}
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={authorHref}
                  className="text-sm font-semibold text-[#907AFF] transition-colors duration-150 ease-out hover:text-[#7058DD] dark:text-[#b8a8ff]"
                >
                  {authorName}
                </Link>
                {followAction}
              </div>

              {/* Title */}
              <h1 className="text-[clamp(26px,4vw,40px)] font-bold leading-[1.1] tracking-tight text-slate-900 dark:text-white">
                {title}
              </h1>

              {/* Description */}
              <p className="max-w-2xl text-[15px] leading-relaxed text-slate-500 dark:text-white/50">
                {description || "No description yet."}
              </p>

              {/* Meta chips */}
              <div className="flex flex-wrap gap-2">{metaChips}</div>

              {/* Language switcher */}
              {languageSwitcher ? <div className="space-y-2">{languageSwitcher}</div> : null}
            </div>

            {/* Notices */}
            {notices ? <div className="space-y-3">{notices}</div> : null}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">{actionBar}</div>
            {utilityBar ? (
              <div className="flex flex-wrap items-center gap-3">{utilityBar}</div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Edition details (inline bar) ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {editionNotes.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-black/[0.05] bg-white/60 px-3 py-3 backdrop-blur-sm sm:px-5 sm:py-4 dark:border-white/[0.06] dark:bg-white/[0.02]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/35">
              {item.label}
            </p>
            <p className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Chapters ── */}
      <div className="rounded-2xl border border-black/[0.05] bg-white/60 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
        <div className="border-b border-black/[0.05] px-6 py-4 dark:border-white/[0.06]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
            Chapters
          </h3>
        </div>
        <div className="p-4 sm:p-5">{chaptersSection}</div>
      </div>

      {/* ── Print on demand ── */}
      {podSection}

      {/* ── Related books ── */}
      {relatedSection}

      {/* ── Reviews ── */}
      {reviewsSection}

      {/* ── Comments ── */}
      {commentsSection}
    </div>
  );
}
