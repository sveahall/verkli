import Link from "next/link";
import {
  ReaderContextCard,
  ReaderSectionHeader,
} from "@/features/reader/shared/ReaderScaffold";

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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="section-gap">
        <header>
          <Link href={backHref} className="btn-ghost px-0">
            <span aria-hidden>←</span>
            Back to discover
          </Link>
        </header>

        <section className="overflow-hidden rounded-[32px] border border-black/[0.06] bg-[radial-gradient(circle_at_top_left,_rgba(144,122,255,0.16),_rgba(255,255,255,0.97)_38%,_rgba(250,250,252,0.98)_100%)] p-5 shadow-[0_26px_80px_-44px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,_rgba(144,122,255,0.18),_rgba(15,23,42,0.94)_40%,_rgba(2,6,23,0.98)_100%)] sm:p-7 lg:p-8">
          <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
            <div className="max-w-[280px]">{cover}</div>

            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={authorHref}
                    className="text-[15px] font-medium text-slate-600 transition hover:text-slate-900 dark:text-white/65 dark:hover:text-white"
                  >
                    {authorName}
                  </Link>
                  {followAction}
                </div>
                <div className="space-y-3">
                  <h1 className="text-[34px] font-semibold tracking-tight text-slate-950 dark:text-white sm:text-[42px]">
                    {title}
                  </h1>
                  <p className="max-w-3xl text-[15px] leading-relaxed text-slate-600 dark:text-white/65">
                    {description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">{metaChips}</div>
                {languageSwitcher ? <div className="space-y-2">{languageSwitcher}</div> : null}
              </div>

              {notices ? <div className="space-y-3">{notices}</div> : null}
              <div className="flex flex-wrap items-center gap-3">{actionBar}</div>
              {utilityBar ? <div className="flex flex-wrap items-center gap-3">{utilityBar}</div> : null}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <section className="rounded-[28px] border border-black/[0.06] bg-white/88 p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.32)] dark:border-white/10 dark:bg-white/[0.04]">
              <ReaderSectionHeader
                eyebrow="Description"
                title="About this book"
                description="Everything a reader needs before deciding to start the first chapter."
              />
              <div className="mt-5 text-[15px] leading-relaxed text-slate-600 dark:text-white/65">
                <p>{description || "No description yet."}</p>
              </div>
            </section>

            <section className="rounded-[28px] border border-black/[0.06] bg-white/88 p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.32)] dark:border-white/10 dark:bg-white/[0.04]">
              <ReaderSectionHeader
                eyebrow="Chapters"
                title="Choose where to begin"
                description="A clear chapter list with preview, unlock, and continue states."
              />
              <div className="mt-5">{chaptersSection}</div>
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <ReaderContextCard
              title="Edition details"
              description="The information a reader normally checks before opening the book."
            >
              <div className="space-y-3">
                {editionNotes.map((item) => (
                  <div key={item.label} className="border-b border-black/[0.06] pb-3 last:border-b-0 last:pb-0 dark:border-white/10">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-white/35">
                      {item.label}
                    </p>
                    <p className="mt-1 text-[14px] text-slate-700 dark:text-white/70">{item.value}</p>
                  </div>
                ))}
              </div>
            </ReaderContextCard>
          </aside>
        </div>

        {podSection}
        {relatedSection}
        {reviewsSection}
        {commentsSection}
      </div>
    </div>
  );
}
