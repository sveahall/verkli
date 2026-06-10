import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Compass,
  Sparkles,
  Users,
} from "lucide-react";
import BookCard from "@/components/reader/BookCard";
import AuthorCard from "@/components/reader/AuthorCard";
import { getDiscoverHref } from "@/lib/flags";

type ContinueReadingBook = {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  progress: number;
  href: string;
  chapterLabel?: string | null;
  lastOpenedLabel?: string | null;
};

type ShelfBook = {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  href: string;
  tag?: string;
  length?: string;
  hasTrailer?: boolean;
};

type AuthorHighlight = {
  id: string;
  name: string;
  avatar: string | null;
  genre: string;
  meta: string;
};

type Spotlight = {
  title: string;
  author: string;
  cover: string | null;
  href: string;
  badge: string;
  caption: string;
  progress?: number;
};

type ReadingStats = {
  booksReading: number;
  booksFinished: number;
  bookmarksCount: number;
};

type ReaderHomePageViewProps = {
  greeting: string;
  spotlight: Spotlight | null;
  continueReading: ContinueReadingBook[];
  recommendedBooks: ShelfBook[];
  trendingBooks: ShelfBook[];
  latestReleases: ShelfBook[];
  authorHighlights: AuthorHighlight[];
  readingStats: ReadingStats;
};

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { href: string; text: string };
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-section-title">
        {title}
      </h3>
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center gap-1 rounded-full border border-[#907AFF]/20 bg-[#907AFF]/[0.06] px-3 py-1 text-xs font-medium text-[#907AFF] transition-colors hover:bg-[#907AFF]/10 dark:border-[#907AFF]/25 dark:bg-[#907AFF]/[0.08]"
        >
          {action.text}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

export default function ReaderHomePageView({
  greeting,
  spotlight,
  continueReading,
  recommendedBooks,
  trendingBooks,
  latestReleases,
  authorHighlights,
  readingStats,
}: ReaderHomePageViewProps) {
  const discoverHref = getDiscoverHref();
  // Spotlight CTA falls back to the user's library so the primary action stays
  // useful when discovery is gated off.
  const spotlightFallbackHref = discoverHref ?? "/reader/library";
  const seeAllAction = discoverHref
    ? { href: discoverHref, text: "See all" }
    : undefined;
  return (
    <div className="reader-stagger space-y-6">
      {/* ── Header ── */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#907AFF]">
          Home
        </p>
        <h1 className="mt-1 text-page-title">
          {greeting}
        </h1>
        <p className="mt-1 text-sm text-[#64748B] dark:text-white/50">
          Pick up where you left off, or find your next read.
        </p>
      </header>

      {/* ════════════════════════════════════════════
          TOP SECTION — main + sidebar
         ════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* ── Main column ── */}
        <div className="space-y-4">
          {/* Hero Spotlight */}
          <section className="card-base relative flex items-center gap-4 overflow-hidden p-4 sm:gap-6 sm:p-6">
            {/* Atmospheric cover backdrop */}
            {spotlight?.cover && (
              <Image
                src={spotlight.cover}
                alt=""
                aria-hidden="true"
                fill
                sizes="100vw"
                className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-[0.08] dark:opacity-[0.22]"
                style={{ filter: "blur(80px) saturate(2)" }}
              />
            )}
            <Link
              href={spotlight?.href ?? spotlightFallbackHref}
              className="group relative w-[120px] flex-shrink-0 sm:w-[150px] lg:w-[170px]"
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-black/[0.06] shadow-md transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-[1.03] dark:border-white/10">
                {spotlight?.cover ? (
                  <Image
                    src={spotlight.cover}
                    alt={spotlight.title}
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#F8F9FB] dark:bg-white/5">
                    <BookMarked className="h-6 w-6 text-[#907AFF]/30" />
                  </div>
                )}
              </div>
            </Link>
            <div className="min-w-0 flex-1 space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#907AFF]/10 px-2.5 py-1 text-xs font-semibold text-[#907AFF]">
                <Sparkles className="h-3 w-3" />
                {spotlight?.badge ?? "Featured"}
              </span>
              <h2 className="text-xl font-semibold tracking-tight text-[#0F172A] sm:text-2xl lg:text-[28px] dark:text-white">
                {spotlight?.title ?? "Find your next read"}
              </h2>
              <p className="text-sm text-[#64748B] dark:text-white/50">
                {spotlight
                  ? `${spotlight.author} \u00b7 ${spotlight.caption}`
                  : "Browse discovery or pick up where you left off."}
              </p>
              <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:gap-4">
                <Link
                  href={spotlight?.href ?? spotlightFallbackHref}
                  className="btn-primary inline-flex w-full items-center justify-center gap-2 text-sm sm:w-auto"
                >
                  <BookOpen className="h-4 w-4" />
                  {spotlight?.progress != null ? "Resume" : "Open book"}
                </Link>
                {discoverHref && (
                  <Link
                    href={discoverHref}
                    className="text-center text-sm font-medium text-[#64748B] transition-colors hover:text-[#0F172A] sm:text-left dark:text-white/50 dark:hover:text-white"
                  >
                    Discover more
                  </Link>
                )}
              </div>
            </div>
          </section>

          {/* Continue Reading */}
          {continueReading.length > 0 && (
            <section className="card-base p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#0F172A] dark:text-white">
                  Continue Reading
                </h3>
                <Link
                  href="/reader/library"
                  className="inline-flex items-center gap-1 rounded-full border border-[#907AFF]/20 bg-[#907AFF]/[0.06] px-3 py-1 text-xs font-medium text-[#907AFF] transition-colors hover:bg-[#907AFF]/10 dark:border-[#907AFF]/25 dark:bg-[#907AFF]/[0.08]"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="mt-4 space-y-1">
                {continueReading.slice(0, 4).map((book) => (
                  <Link
                    key={book.id}
                    href={book.href}
                    className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[#F8F9FB] dark:hover:bg-white/[0.04]"
                  >
                    <div className="relative h-[60px] w-[42px] flex-shrink-0 overflow-hidden rounded-lg border border-black/[0.06] shadow-sm dark:border-white/10">
                      {book.cover ? (
                        <Image
                          src={book.cover}
                          alt={book.title}
                          fill
                          sizes="42px"
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.06]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[#F8F9FB] dark:bg-white/5">
                          <BookMarked className="h-3 w-3 text-[#64748B]/30" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="truncate text-sm font-medium text-[#0F172A] transition-colors group-hover:text-[#907AFF] dark:text-white">
                        {book.title}
                      </p>
                      <p className="truncate text-xs text-[#64748B] dark:text-white/50">
                        {book.chapterLabel ?? book.author}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#907AFF] to-[#A48FFF]"
                            style={{ width: `${Math.max(0, Math.min(100, book.progress))}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-medium tabular-nums text-[#64748B] dark:text-white/40">
                          {Math.round(book.progress)}%
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Discover CTA — when no continue reading */}
          {continueReading.length === 0 && discoverHref && (
            <Link
              href={discoverHref}
              className="card-base group flex items-center gap-4 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#907AFF]/10 text-[#907AFF]">
                <Compass className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#0F172A] dark:text-white">
                  Discover books
                </p>
                <p className="text-xs text-[#64748B] dark:text-white/50">
                  Browse the catalog and start your reading journey
                </p>
              </div>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-[#64748B] transition-transform group-hover:translate-x-0.5 dark:text-white/40" />
            </Link>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          {/* Reading Stats */}
          <section className="card-base p-4 sm:p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#64748B] dark:text-white/50">
              Your Reading
            </h3>
            <div className="mt-3 flex divide-x divide-black/[0.05] text-center dark:divide-white/[0.07] sm:mt-4">
              <div className="flex-1 py-3">
                <p className="text-3xl font-semibold tracking-tight text-[#0F172A] dark:text-white">
                  {readingStats.booksReading}
                </p>
                <p className="mt-0.5 text-xs text-[#64748B] dark:text-white/50">Reading</p>
              </div>
              <div className="flex-1 py-3">
                <p className="text-3xl font-semibold tracking-tight text-[#0F172A] dark:text-white">
                  {readingStats.booksFinished}
                </p>
                <p className="mt-0.5 text-xs text-[#64748B] dark:text-white/50">Finished</p>
              </div>
              <div className="flex-1 py-3">
                <p className="text-3xl font-semibold tracking-tight text-[#0F172A] dark:text-white">
                  {readingStats.bookmarksCount}
                </p>
                <p className="mt-0.5 text-xs text-[#64748B] dark:text-white/50">Saved</p>
              </div>
            </div>
          </section>

          {/* Authors */}
          <section className="card-base p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[#64748B] dark:text-white/50">
                Authors
              </h3>
              <Users className="h-3.5 w-3.5 text-[#64748B] dark:text-white/40" />
            </div>
            {authorHighlights.length > 0 ? (
              <div className="mt-4 space-y-3">
                {authorHighlights.slice(0, 4).map((author) => (
                  <Link
                    key={author.id}
                    href={`/reader/authors/${author.id}`}
                    className="group flex items-center gap-3"
                  >
                    <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#907AFF]/10 text-xs font-semibold text-[#907AFF] ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
                      {author.avatar ? (
                        <Image
                          src={author.avatar}
                          alt={author.name}
                          fill
                          sizes="36px"
                          className="object-cover"
                        />
                      ) : (
                        author.name
                          .split(" ")
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join("")
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#0F172A] transition-colors group-hover:text-[#907AFF] dark:text-white">
                        {author.name}
                      </p>
                      <p className="truncate text-xs text-[#64748B] dark:text-white/50">
                        {author.meta}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-xs text-[#64748B] dark:text-white/50">
                Authors appear here as they publish.
              </p>
            )}
            <Link
              href="/reader/authors"
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#907AFF]/[0.08] py-2.5 text-xs font-semibold tracking-wide text-[#907AFF] transition-colors hover:bg-[#907AFF]/[0.13] dark:bg-[#907AFF]/[0.10]"
            >
              Explore all authors
              <ArrowRight className="h-3 w-3" />
            </Link>
          </section>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          DISCOVERY GRIDS
         ════════════════════════════════════════════ */}

      {trendingBooks.length > 0 && (
        <section className="space-y-4 mb-0">
          <SectionHeader
            title="Trending"
            action={seeAllAction}
          />
          <div className="card-base divide-y divide-black/[0.04] px-4 py-1 dark:divide-white/[0.05]">
            {trendingBooks.map((book, i) => (
              <Link
                key={book.id}
                href={book.href}
                className="group flex items-center gap-4 py-3 transition-colors duration-150 first:pt-3.5 last:pb-3.5"
              >
                <span className="w-6 flex-shrink-0 text-center text-sm font-semibold tabular-nums text-[#64748B] dark:text-white/35">
                  {i + 1}
                </span>
                <div className="relative h-[52px] w-[36px] flex-shrink-0 overflow-hidden rounded-lg border border-black/[0.06] shadow-sm dark:border-white/10">
                  {book.cover ? (
                    <Image
                      src={book.cover}
                      alt={book.title ?? ""}
                      fill
                      sizes="36px"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.08]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#F8F9FB] dark:bg-white/5">
                      <BookMarked className="h-3 w-3 text-[#64748B]/40" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[#0F172A] transition-colors group-hover:text-[#907AFF] dark:text-white dark:group-hover:text-[#b8a8ff]">
                    {book.title}
                  </p>
                  <p className="truncate text-xs text-[#64748B] dark:text-white/50">
                    {book.author}
                    {book.length && <span className="before:mx-1.5 before:content-['·']">{book.length}</span>}
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-[#64748B]/40 transition-transform duration-150 group-hover:translate-x-0.5 dark:text-white/30" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {recommendedBooks.length > 0 && (
        <section className="space-y-4 mt-0">
          <SectionHeader
            title="Recommended for you"
            action={seeAllAction}
          />
          <div className="-mx-4 sm:mx-0">
            <div className="scrollbar-none flex gap-3 overflow-x-auto px-4 pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 md:grid-cols-4 lg:grid-cols-5">
              {recommendedBooks.map((book) => (
                <div key={book.id} className="w-[148px] flex-shrink-0 sm:w-auto">
                  <BookCard
                    id={book.id}
                    title={book.title}
                    author={book.author}
                    cover={book.cover}
                    href={book.href}
                    tag={book.tag}
                    length={book.length}
                    hasTrailer={book.hasTrailer}
                    layout="grid"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {latestReleases.length > 0 && (
        <section className="space-y-4">
          <SectionHeader
            title="New releases"
            action={seeAllAction}
          />
          <div className="-mx-4 sm:mx-0">
            <div className="scrollbar-none flex gap-3 overflow-x-auto px-4 pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 md:grid-cols-4 lg:grid-cols-5">
              {latestReleases.map((book) => (
                <div key={book.id} className="w-[148px] flex-shrink-0 sm:w-auto">
                  <BookCard
                    id={book.id}
                    title={book.title}
                    author={book.author}
                    cover={book.cover}
                    href={book.href}
                    tag={book.tag}
                    length={book.length}
                    hasTrailer={book.hasTrailer}
                    layout="grid"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {authorHighlights.length > 1 && (
        <section className="space-y-4">
          <SectionHeader title="Writers gaining momentum" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {authorHighlights.slice(1, 5).map((a) => (
              <AuthorCard
                key={a.id}
                name={a.name}
                avatar={a.avatar}
                genre={a.genre}
                meta={a.meta}
                href={`/reader/authors/${a.id}`}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
