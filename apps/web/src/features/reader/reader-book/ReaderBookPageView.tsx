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
    <div className="mx-auto max-w-5xl space-y-8 pb-12 pt-1">
      {/* ── Back link ── */}
      <header>
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-medium text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground dark:hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to discover
        </Link>
      </header>

      {/* ── Hero card ── */}
      <div className="card-base relative bg-card/80 backdrop-blur-sm dark:bg-card">
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
                  className="text-sm font-semibold text-accent-foreground transition-colors duration-150 ease-out hover:text-accent-foreground"
                >
                  {authorName}
                </Link>
                {followAction}
              </div>

              {/* Title */}
              <h1 className="text-[clamp(28px,4vw,44px)] font-medium leading-[1.15] tracking-tight text-foreground font-display">
                {title}
              </h1>

              {/* Description */}
              <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
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
        <div className="flex flex-col divide-y divide-border sm:flex-row sm:divide-x sm:divide-y-0">
          {editionNotes.map((item) => (
            <div key={item.label} className="flex-1 px-5 py-4 sm:px-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Chapters ── */}
      <div className="card-base overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-lg font-medium text-foreground font-display">
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
