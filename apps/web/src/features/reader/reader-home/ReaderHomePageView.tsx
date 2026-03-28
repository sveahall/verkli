import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookMarked, BookOpen, Sparkles } from "lucide-react";
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

/* ── Card wrapper matching author platform ── */
const CARD = "rounded-2xl border border-black/[0.05] bg-white/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none";

function SectionHeader({
  label,
  title,
  action,
}: {
  label: string;
  title: string;
  action?: { href: string; text: string };
}) {
  return (
    <div className="flex items-center justify-between border-b border-black/[0.05] px-6 py-4 dark:border-white/[0.06]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#907AFF]">{label}</p>
        <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#907AFF] transition-colors duration-150 ease-out hover:text-[#7058DD]"
        >
          {action.text} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function ShelfPanel({ label, title, books }: { label: string; title: string; books: ShelfBook[] }) {
  if (books.length === 0) return null;
  return (
    <div className={CARD}>
      <SectionHeader label={label} title={title} />
      <div className="p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {books.map((book) => (
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
            />
          ))}
        </div>
      </div>
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
  const heroDescription = spotlight
    ? `${spotlight.author} · ${spotlight.caption}`
    : "Pick up where you left off or find something new.";
  const featuredAuthor = authorHighlights[0] ?? null;
  const moreAuthors = authorHighlights.slice(1, 5);
  const hasCatalogShelves = recommendedBooks.length > 0 || trendingBooks.length > 0 || latestReleases.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">Home</p>
          <h1 className="mt-1 text-[clamp(22px,3vw,28px)] font-bold tracking-tight text-slate-900 dark:text-white">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-white/50">
            Your reading home — continue active books or discover something new.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/reader/discover"
            className="rounded-xl border border-black/[0.06] bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
          >
            Discover books
          </Link>
          <Link
            href="/reader/library"
            className="rounded-xl border border-black/[0.06] bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
          >
            Open library
          </Link>
        </div>
      </header>

      {/* ── Hero spotlight ── */}
      <div className="relative overflow-hidden rounded-2xl border border-black/[0.05] bg-white/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.03] dark:shadow-none">
        <div className="pointer-events-none absolute -right-32 -top-32 h-[400px] w-[400px] rounded-full bg-[#907AFF]/[0.06] blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-[300px] w-[300px] rounded-full bg-[#E29ED5]/[0.04] blur-[80px]" />
        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_240px] lg:items-center">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#907AFF]/10 px-3 py-1 text-[11px] font-semibold text-[#907AFF] dark:bg-[#907AFF]/20">
              <Sparkles className="h-3 w-3" />
              {spotlight?.badge ?? "Featured"}
            </span>
            <div className="space-y-2">
              <h2 className="text-[clamp(26px,4vw,40px)] font-bold leading-[1.1] tracking-tight text-slate-900 dark:text-white">
                {spotlight?.title ?? "Find your next read"}
              </h2>
              <p className="max-w-lg text-sm leading-relaxed text-slate-500 dark:text-white/50">{heroDescription}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={spotlight?.href ?? "/reader/discover"}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#907AFF] to-[#7c6ae6] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(144,122,255,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] transition-[transform,box-shadow] duration-150 ease-out hover:shadow-[0_4px_12px_rgba(144,122,255,0.35)] active:scale-[0.97]"
              >
                <BookOpen className="h-4 w-4" />
                {spotlight?.progress != null ? "Resume reading" : "Open book"}
              </Link>
              <Link
                href="/reader/discover"
                className="text-sm font-semibold text-slate-500 transition-colors duration-150 ease-out hover:text-slate-700 dark:text-white/50 dark:hover:text-white/80"
              >
                Discover more
              </Link>
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="relative mx-auto w-[180px]">
              <div className="absolute inset-4 rounded-2xl bg-[#907AFF]/15 blur-2xl" />
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/50 bg-slate-100 shadow-[0_20px_60px_-16px_rgba(144,122,255,0.3)] dark:border-white/10">
                {spotlight?.cover ? (
                  <Image src={spotlight.cover} alt={spotlight.title} fill sizes="180px" className="object-cover" unoptimized />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/15 to-[#E29ED5]/10">
                    <BookMarked className="h-10 w-10 text-[#907AFF]/30" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Continue reading ── */}
      {continueReading.length > 0 ? (
        <div className={CARD}>
          <SectionHeader
            label="Continue reading"
            title="Pick up where you left off"
            action={{ href: "/reader/library", text: "View all" }}
          />
          <div className="p-5">
            <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
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
          </div>
        </div>
      ) : null}

      {/* ── Author spotlight ── */}
      {featuredAuthor ? (
        <div className={CARD}>
          <SectionHeader label="Author spotlight" title="A voice worth following" />
          <div className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <AuthorCard
                  name={featuredAuthor.name}
                  avatar={featuredAuthor.avatar}
                  genre={featuredAuthor.genre}
                  meta={featuredAuthor.meta}
                  href={`/reader/authors/${featuredAuthor.id}`}
                />
              </div>
              <Link
                href="/reader/discover"
                className="shrink-0 self-start rounded-xl border border-black/[0.06] bg-white px-4 py-2 text-[13px] font-medium text-slate-700 transition-colors duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
              >
                Find more authors
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Empty state ── */}
      {continueReading.length === 0 && !hasCatalogShelves ? (
        <div className={CARD}>
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#907AFF]/10 dark:bg-[#907AFF]/15">
              <BookOpen className="h-6 w-6 text-[#907AFF]" />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-slate-900 dark:text-white">
              Start building your shelves
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500 dark:text-white/50">
              Open a book from discovery and your reading progress will appear here.
            </p>
            <Link
              href="/reader/discover"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#907AFF] to-[#7c6ae6] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(144,122,255,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] transition-[transform,box-shadow] duration-150 ease-out hover:shadow-[0_4px_12px_rgba(144,122,255,0.35)] active:scale-[0.97]"
            >
              <BookOpen className="h-4 w-4" /> Browse discovery
            </Link>
          </div>
        </div>
      ) : null}

      {/* ── Book shelves ── */}
      {hasCatalogShelves ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ShelfPanel label="Recommended" title="For you" books={recommendedBooks} />
          <ShelfPanel label="Trending" title="Readers are opening" books={trendingBooks} />
          <ShelfPanel label="New releases" title="Fresh to the catalog" books={latestReleases} />
        </div>
      ) : null}

      {/* ── More authors ── */}
      {moreAuthors.length > 0 ? (
        <div className={CARD}>
          <SectionHeader label="More authors" title="Writers gaining momentum" />
          <div className="p-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {moreAuthors.map((a) => (
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
