import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookMarked, BookOpen, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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

function ShelfPanel({ eyebrow, title, books }: { eyebrow: string; title: string; books: ShelfBook[] }) {
  if (books.length === 0) return null;
  return (
    <Card>
      <CardContent>
        <p className="text-eyebrow text-[#907AFF]">{eyebrow}</p>
        <h3 className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white">{title}</h3>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {books.map((book) => (
            <BookCard key={book.id} id={book.id} title={book.title} author={book.author} cover={book.cover} href={book.href} tag={book.tag} length={book.length} layout="grid" size="lg" />
          ))}
        </div>
      </CardContent>
    </Card>
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="Home"
        title={greeting}
        description="Your reading home — continue active books or discover something new."
        actions={
          <>
            <Link href="/reader/discover" className="btn-secondary">Discover books</Link>
            <Link href="/reader/library" className="btn-secondary">Open library</Link>
          </>
        }
      />

      {/* ── Hero spotlight ── */}
      <Card className="relative overflow-hidden border-[#907AFF]/[0.08] bg-gradient-to-br from-[#907AFF]/[0.04] via-white to-[#E29ED5]/[0.03] dark:from-[#907AFF]/[0.1] dark:via-[#0f1117] dark:to-[#E29ED5]/[0.05]">
        <div className="pointer-events-none absolute -right-32 -top-32 h-[400px] w-[400px] rounded-full bg-[#907AFF]/[0.06] blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-[300px] w-[300px] rounded-full bg-[#E29ED5]/[0.05] blur-[80px]" />
        <CardContent>
          <div className="relative grid gap-6 lg:grid-cols-[1fr_280px] lg:items-center">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#907AFF]/10 px-3 py-1 text-[12px] font-semibold text-[#907AFF] dark:bg-[#907AFF]/20">
                <Sparkles className="h-3 w-3" />
                {spotlight?.badge ?? "Featured"}
              </span>
              <div className="space-y-2">
                <h2 className="text-[32px] font-bold leading-[1.1] tracking-tight text-slate-950 dark:text-white sm:text-[42px]">
                  {spotlight?.title ?? "Find your next read"}
                </h2>
                <p className="max-w-lg text-[15px] leading-relaxed text-slate-500 dark:text-white/50">{heroDescription}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={spotlight?.href ?? "/reader/discover"} className="btn-primary inline-flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  {spotlight?.progress != null ? "Resume reading" : "Open book"}
                </Link>
                <Link href="/reader/discover" className="btn-ghost">Discover more</Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative mx-auto w-[200px]">
                <div className="absolute inset-4 rounded-[20px] bg-[#907AFF]/20 blur-2xl" />
                <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] border border-white/50 bg-slate-100 shadow-[0_20px_60px_-16px_rgba(144,122,255,0.35)] dark:border-white/10">
                  {spotlight?.cover ? (
                    <Image src={spotlight.cover} alt={spotlight.title} fill sizes="200px" className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/15 to-[#E29ED5]/10">
                      <BookMarked className="h-10 w-10 text-[#907AFF]/40" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Continue reading ── */}
      {continueReading.length > 0 ? (
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-eyebrow text-[#907AFF]">Continue reading</p>
                <h3 className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white">Pick up where you left off</h3>
              </div>
              <Link href="/reader/library" className="btn-ghost text-[13px]">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-4 -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
              {continueReading.map((book) => (
                <div key={book.id} className="snap-start">
                  <ReaderContinueCard title={book.title} author={book.author} href={book.href} cover={book.cover} progress={book.progress} chapterLabel={book.chapterLabel} lastOpenedLabel={book.lastOpenedLabel} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Author spotlight ── */}
      {featuredAuthor ? (
        <Card>
          <CardContent>
            <p className="text-eyebrow text-[#907AFF]">Author spotlight</p>
            <h3 className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white">A voice worth following</h3>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <AuthorCard name={featuredAuthor.name} avatar={featuredAuthor.avatar} genre={featuredAuthor.genre} meta={featuredAuthor.meta} href={`/reader/authors/${featuredAuthor.id}`} />
              </div>
              <Link href="/reader/discover" className="btn-secondary shrink-0 self-start text-[13px]">Find more authors</Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Empty state ── */}
      {continueReading.length === 0 && !hasCatalogShelves ? (
        <Card className="border-[#907AFF]/[0.06] bg-gradient-to-br from-[#907AFF]/[0.03] via-white to-[#E29ED5]/[0.02] dark:from-[#907AFF]/[0.08] dark:via-[#0f1117] dark:to-[#E29ED5]/[0.04]">
          <CardContent className="py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#907AFF]/10">
              <BookOpen className="h-6 w-6 text-[#907AFF]" />
            </div>
            <h2 className="mt-4 text-[18px] font-semibold text-slate-900 dark:text-white">Start building your shelves</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[14px] text-slate-500 dark:text-white/50">
              Open a book from discovery and your reading progress will appear here.
            </p>
            <Link href="/reader/discover" className="btn-primary mt-4 inline-flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Browse discovery
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Book shelves ── */}
      {hasCatalogShelves ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ShelfPanel eyebrow="Recommended" title="For you" books={recommendedBooks} />
          <ShelfPanel eyebrow="Trending" title="Readers are opening" books={trendingBooks} />
          <ShelfPanel eyebrow="New releases" title="Fresh to the catalog" books={latestReleases} />
        </div>
      ) : null}

      {/* ── More authors ── */}
      {moreAuthors.length > 0 ? (
        <Card>
          <CardContent>
            <p className="text-eyebrow text-[#907AFF]">More authors</p>
            <h3 className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white">Writers gaining momentum</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {moreAuthors.map((a) => <AuthorCard key={a.id} name={a.name} avatar={a.avatar} genre={a.genre} meta={a.meta} href={`/reader/authors/${a.id}`} />)}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
