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
    <div className="flex items-end justify-between">
      <h3 className="text-xl font-semibold text-[#0F172A] dark:text-white">
        {title}
      </h3>
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#907AFF] transition-colors hover:text-[#7058DD]"
        >
          {action.text}
          <ArrowRight className="h-3.5 w-3.5" />
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
  return (
    <div className="reader-stagger space-y-6">
      {/* ── Header ── */}
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] dark:text-white">
          {greeting}
        </h1>
      </header>

      {/* ════════════════════════════════════════════
          TOP SECTION — main + sidebar
         ════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* ── Main column ── */}
        <div className="space-y-4">
          {/* Hero Spotlight */}
          <section className="card-base flex items-center gap-4 p-4 sm:gap-6 sm:p-6">
            <Link
              href={spotlight?.href ?? "/reader/discover"}
              className="group relative w-[100px] flex-shrink-0 sm:w-[120px]"
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-black/[0.06] shadow-sm transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-[1.04] dark:border-white/10">
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
              <h2 className="text-lg font-semibold tracking-tight text-[#0F172A] sm:text-xl lg:text-2xl dark:text-white">
                {spotlight?.title ?? "Find your next read"}
              </h2>
              <p className="text-sm text-[#64748B] dark:text-white/50">
                {spotlight
                  ? `${spotlight.author} \u00b7 ${spotlight.caption}`
                  : "Browse discovery or pick up where you left off."}
              </p>
              <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:gap-4">
                <Link
                  href={spotlight?.href ?? "/reader/discover"}
                  className="btn-primary inline-flex w-full items-center justify-center gap-2 text-sm sm:w-auto"
                >
                  <BookOpen className="h-4 w-4" />
                  {spotlight?.progress != null ? "Resume" : "Open book"}
                </Link>
                <Link
                  href="/reader/discover"
                  className="text-center text-sm font-medium text-[#64748B] transition-colors hover:text-[#0F172A] sm:text-left dark:text-white/50 dark:hover:text-white"
                >
                  Discover more
                </Link>
              </div>
            </div>
          </section>

          {/* Continue Reading */}
          {continueReading.length > 0 && (
            <section className="card-base p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#0F172A] dark:text-white">
                  Continue Reading
                </h3>
                <Link
                  href="/reader/library"
                  className="inline-flex items-center gap-1 text-sm font-medium text-[#907AFF] hover:text-[#7058DD]"
                >
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="mt-4 space-y-3">
                {continueReading.slice(0, 4).map((book) => (
                  <Link
                    key={book.id}
                    href={book.href}
                    className="group flex items-center gap-4 rounded-xl p-2 transition-colors hover:bg-[#F8F9FB] dark:hover:bg-white/[0.04]"
                  >
                    <div className="relative h-[56px] w-[40px] flex-shrink-0 overflow-hidden rounded-lg border border-black/[0.06] dark:border-white/10">
                      {book.cover ? (
                        <Image
                          src={book.cover}
                          alt={book.title}
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[#F8F9FB] dark:bg-white/5">
                          <BookMarked className="h-3 w-3 text-[#64748B]/30" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#0F172A] group-hover:text-[#907AFF] dark:text-white">
                        {book.title}
                      </p>
                      <p className="truncate text-xs text-[#64748B] dark:text-white/50">
                        {book.author}
                      </p>
                    </div>
                    <div className="flex w-24 flex-shrink-0 items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-[#907AFF]"
                          style={{
                            width: `${Math.max(0, Math.min(100, book.progress))}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium text-[#64748B] dark:text-white/40">
                        {Math.round(book.progress)}%
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Discover CTA — when no continue reading */}
          {continueReading.length === 0 && (
            <Link
              href="/reader/discover"
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
            <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:mt-4">
              <div className="rounded-xl bg-[#F8F9FB] py-4 dark:bg-white/[0.06]">
                <p className="text-2xl font-semibold text-[#0F172A] dark:text-white">
                  {readingStats.booksReading}
                </p>
                <p className="mt-0.5 text-xs text-[#64748B] dark:text-white/50">
                  Reading
                </p>
              </div>
              <div className="rounded-xl bg-[#F8F9FB] py-4 dark:bg-white/[0.06]">
                <p className="text-2xl font-semibold text-[#0F172A] dark:text-white">
                  {readingStats.booksFinished}
                </p>
                <p className="mt-0.5 text-xs text-[#64748B] dark:text-white/50">
                  Finished
                </p>
              </div>
              <div className="rounded-xl bg-[#F8F9FB] py-4 dark:bg-white/[0.06]">
                <p className="text-2xl font-semibold text-[#0F172A] dark:text-white">
                  {readingStats.bookmarksCount}
                </p>
                <p className="mt-0.5 text-xs text-[#64748B] dark:text-white/50">
                  Saved
                </p>
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
                    <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#907AFF]/10 text-xs font-semibold text-[#907AFF]">
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
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-[#907AFF]/10 py-2 text-sm font-medium text-[#907AFF] transition-colors hover:bg-[#907AFF]/15"
            >
              Explore all authors
            </Link>
          </section>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          DISCOVERY GRIDS
         ════════════════════════════════════════════ */}

      {trendingBooks.length > 0 && (
        <section className="space-y-4">
          <SectionHeader
            title="Trending"
            action={{ href: "/reader/discover", text: "See all" }}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {trendingBooks.map((book) => (
              <BookCard
                key={book.id}
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
            ))}
          </div>
        </section>
      )}

      {recommendedBooks.length > 0 && (
        <section className="space-y-4">
          <SectionHeader
            title="Recommended for you"
            action={{ href: "/reader/discover", text: "See all" }}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {recommendedBooks.map((book) => (
              <BookCard
                key={book.id}
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
            ))}
          </div>
        </section>
      )}

      {latestReleases.length > 0 && (
        <section className="space-y-4">
          <SectionHeader
            title="New releases"
            action={{ href: "/reader/discover", text: "See all" }}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {latestReleases.map((book) => (
              <BookCard
                key={book.id}
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
            ))}
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
