import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type ReaderBookPageViewProps = {
  coverUrl?: string | null;
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
  trailerSection?: React.ReactNode;
  editionNotes: Array<{ label: string; value: string }>;
  chaptersSection: React.ReactNode;
  podSection?: React.ReactNode;
  relatedSection?: React.ReactNode;
  reviewsSection: React.ReactNode;
  commentsSection: React.ReactNode;
};

export default function ReaderBookPageView({
  coverUrl,
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
  trailerSection,
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
      <div className="card-base relative bg-white/80 backdrop-blur-sm dark:bg-white/[0.03]">
        {/* Inner clipping layer — keeps filter:blur inside card without clipping cover shadow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          {/* Atmospheric cover backdrop */}
          {coverUrl && (
            <Image
              src={coverUrl}
              alt=""
              aria-hidden="true"
              fill
              sizes="100vw"
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-[0.11] dark:opacity-[0.22]"
              style={{ filter: "blur(72px) saturate(2.2)" }}
            />
          )}
          {/* Decorative glow — contained inside clip layer */}
          <div className="absolute right-0 top-0 h-72 w-72 translate-x-24 -translate-y-24 rounded-full bg-[#907AFF]/[0.10] blur-[80px]" />
        </div>

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

      {/* ── Trailer ── */}
      {trailerSection}

      {/* ── Edition details — unified bar with dividers ── */}
      <div className="card-base overflow-hidden">
        <div className="flex flex-col divide-y divide-slate-200/60 dark:divide-white/[0.06] sm:flex-row sm:divide-x sm:divide-y-0">
          {editionNotes.map((item) => (
            <div key={item.label} className="flex-1 px-5 py-4 sm:px-6">
              <p className="text-xs font-medium uppercase tracking-wider text-[#64748B] dark:text-white/40">
                {item.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#0F172A] dark:text-white">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Chapters ── */}
      <div className="card-base overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4 dark:border-white/[0.06]">
          <h3 className="text-sm font-semibold text-[#0F172A] dark:text-white">
            Chapters
          </h3>
        </div>
        <div className="px-4 py-2 sm:px-6">{chaptersSection}</div>
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
