import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookMarked, BookOpen, Sparkles, TrendingUp } from "lucide-react";
import BookCard from "@/components/reader/BookCard";
import AuthorCard from "@/components/reader/AuthorCard";
import { ReaderContinueCard } from "@/features/reader/shared/ReaderScaffold";

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

type ReaderHomePageViewProps = {
  greeting: string;
  spotlight: Spotlight | null;
  continueReading: ContinueReadingBook[];
  recommendedBooks: ShelfBook[];
  trendingBooks: ShelfBook[];
  latestReleases: ShelfBook[];
  authorHighlights: AuthorHighlight[];
};

function SectionHeader({
  icon,
  label,
  title,
  action,
}: {
  icon?: React.ReactNode;
  label: string;
  title: string;
  action?: { href: string; text: string };
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex items-center gap-4">
        {icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#907AFF]/10">
            {icon}
          </div>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#907AFF]">
            {label}
          </p>
          <h3 className="mt-0.5 text-xl font-semibold text-[#0F172A] dark:text-white">
            {title}
          </h3>
        </div>
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-[#907AFF] transition-[background-color,color] duration-150 hover:bg-[#907AFF]/10 active:scale-[0.97]"
        >
          {action.text} <ArrowRight className="h-3.5 w-3.5" />
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
}: ReaderHomePageViewProps) {
  const heroCaption = spotlight
    ? `${spotlight.author} \u00b7 ${spotlight.caption}`
    : null;
  const hasCatalogShelves =
    recommendedBooks.length > 0 ||
    trendingBooks.length > 0 ||
    latestReleases.length > 0;

  return (
    <div className="space-y-8">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden rounded-2xl bg-[#0F172A]">
        {/* Layered atmospheric gradients */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#907AFF]/20 via-transparent to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#0F172A] to-transparent" />

        {/* Cover ambient glow — high opacity for atmosphere */}
        {spotlight?.cover && (
          <div className="pointer-events-none absolute inset-0 opacity-50">
            <Image
              src={spotlight.cover}
              alt=""
              fill
              className="object-cover blur-3xl saturate-150"
              unoptimized
              aria-hidden="true"
            />
          </div>
        )}

        {/* Radial glow behind cover */}
        <div className="pointer-events-none absolute right-[8%] top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-[#907AFF]/15 blur-3xl" />

        <div className="relative p-6 sm:p-8">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white/60">{greeting}</p>
            <div className="flex items-center gap-4">
              <Link
                href="/reader/discover"
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur-sm transition-[background-color] duration-150 hover:bg-white/20 active:scale-[0.97]"
              >
                Discover books
              </Link>
              <Link
                href="/reader/library"
                className="hidden text-sm font-medium text-white/40 transition-colors duration-150 hover:text-white/70 sm:block"
              >
                Open library
              </Link>
            </div>
          </div>

          {/* Spotlight content */}
          {spotlight ? (
            <div className="mt-6 grid items-center gap-6 pb-2 sm:grid-cols-[1fr_200px] lg:grid-cols-[1fr_300px]">
              <div className="order-2 space-y-4 sm:order-1">
                <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white/90 backdrop-blur-sm">
                  <Sparkles className="h-3.5 w-3.5" />
                  {spotlight.badge}
                </span>
                <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
                  {spotlight.title}
                </h2>
                {heroCaption && (
                  <p className="text-sm text-white/50">{heroCaption}</p>
                )}
                {spotlight.progress != null && (
                  <div className="max-w-xs">
                    <div className="h-1.5 overflow-hidden rounded-xl bg-white/10">
                      <div
                        className="h-full rounded-xl bg-[#907AFF]"
                        style={{ width: `${Math.round(Math.max(0, spotlight.progress))}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-white/30">
                      {Math.round(Math.max(0, spotlight.progress))}% complete
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-4 pt-2">
                  <Link
                    href={spotlight.href}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#907AFF] px-6 py-3 text-sm font-semibold text-white shadow-md transition-[background-color,transform] duration-150 hover:bg-[#907AFF]/90 active:scale-[0.97]"
                  >
                    <BookOpen className="h-4 w-4" />
                    {spotlight.progress != null ? "Resume reading" : "Open book"}
                  </Link>
                  <Link
                    href="/reader/discover"
                    className="text-sm font-medium text-white/40 transition-colors duration-150 hover:text-white/70"
                  >
                    Discover more
                  </Link>
                </div>
              </div>

              {/* Cover with glow */}
              <div className="order-1 sm:order-2">
                <div className="mx-auto w-40 sm:w-full">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-2xl shadow-[0_20px_60px_-10px_rgba(144,122,255,0.35)] ring-1 ring-white/15 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:scale-[1.02]">
                    {spotlight.cover ? (
                      <Image
                        src={spotlight.cover}
                        alt={spotlight.title}
                        fill
                        sizes="(min-width: 1024px) 300px, (min-width: 640px) 200px, 160px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-white/5">
                        <BookMarked className="h-8 w-8 text-white/20" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 pb-2">
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                Find your next read
              </h2>
              <p className="mt-2 text-sm text-white/50">
                Browse the catalog and start reading
              </p>
              <Link
                href="/reader/discover"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#907AFF] px-6 py-3 text-sm font-semibold text-white shadow-md transition-[background-color,transform] duration-150 hover:bg-[#907AFF]/90 active:scale-[0.97]"
              >
                <BookOpen className="h-4 w-4" /> Start browsing
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Continue reading ── */}
      {continueReading.length > 0 && (
        <section>
          <SectionHeader
            label="Continue reading"
            title="Pick up where you left off"
            action={{ href: "/reader/library", text: "View all" }}
          />
          <div className="reader-stagger mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
            {continueReading.map((book) => (
              <div key={book.id} className="snap-start">
                <ReaderContinueCard
                  title={book.title}
                  author={book.author}
                  href={book.href}
                  cover={book.cover}
                  progress={book.progress}
                  chapterLabel={book.chapterLabel}
                  lastOpenedLabel={book.lastOpenedLabel}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Trending ── */}
      {trendingBooks.length > 0 && (
        <section>
          <SectionHeader
            icon={<TrendingUp className="h-4 w-4 text-[#907AFF]" />}
            label="Trending"
            title="Readers are opening"
            action={{ href: "/reader/discover", text: "See all" }}
          />
          <div className="reader-stagger mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:overflow-visible">
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
                layout="grid"
                size="lg"
                className="min-w-[160px] sm:min-w-0"
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Recommended ── */}
      {recommendedBooks.length > 0 && (
        <section>
          <SectionHeader
            icon={<Sparkles className="h-4 w-4 text-[#907AFF]" />}
            label="Recommended"
            title="For you"
            action={{ href: "/reader/discover", text: "See all" }}
          />
          <div className="reader-stagger mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6">
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
                layout="grid"
                className="min-w-[140px] sm:min-w-0"
              />
            ))}
          </div>
        </section>
      )}

      {/* ── New releases ── */}
      {latestReleases.length > 0 && (
        <section>
          <SectionHeader
            label="New releases"
            title="Fresh to the catalog"
            action={{ href: "/reader/discover", text: "See all" }}
          />
          <div className="reader-stagger mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:overflow-visible">
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
                layout="grid"
                className="min-w-[160px] sm:min-w-0"
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Author spotlight ── */}
      {authorHighlights.length > 0 && (
        <section>
          <SectionHeader
            label="Author spotlight"
            title="Voices worth following"
            action={{ href: "/reader/discover", text: "Find more" }}
          />
          <div className="reader-stagger mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
            {authorHighlights.map((a) => (
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

      {/* ── Empty state ── */}
      {continueReading.length === 0 && !hasCatalogShelves && (
        <section className="rounded-2xl border border-black/[0.06] bg-white p-8 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#907AFF]/10">
              <BookOpen className="h-6 w-6 text-[#907AFF]" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#0F172A] dark:text-white">
                Your shelves are empty
              </p>
              <p className="text-xs text-[#64748B] dark:text-white/50">
                Open a book to start building your reading history
              </p>
            </div>
            <Link
              href="/reader/discover"
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#907AFF] px-6 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#907AFF]/90 active:scale-[0.97]"
            >
              <BookOpen className="h-4 w-4" /> Discover books
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
