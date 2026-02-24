import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";
import { getRecommendationsEnabled } from "@/lib/flags";
import AuthorCard from "@/components/reader/AuthorCard";
import BookCard from "@/components/reader/BookCard";
import EmptyState from "@/components/reader/EmptyState";
import Rail from "@/components/reader/Rail";
import ForYouRail from "@/components/reader/ForYouRail";
import { ErrorBannerWrapper } from "@/components/ui/ErrorBanner";
import { ErrorState } from "@/components/ui/states";

type ContinueReadingBook = {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  progress: number;
  href: string;
};

type PublishedBook = {
  id: string;
  title: string;
  authorId: string;
  author: string;
  cover: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

type ChartBook = PublishedBook & {
  score: number;
  averageRating: number | null;
  reviewCount: number;
  readerCount: number;
  bookmarkCount: number;
};

type AuthorMomentum = {
  id: string;
  name: string;
  avatar: string | null;
  genre: string;
  meta: string;
};

type BookSignal = {
  reviewCount: number;
  ratingSum: number;
  readerCount: number;
  bookmarkCount: number;
};

type ProfileLite = {
  name: string;
  avatarPath: string | null;
  bio: string | null;
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

const BOOK_POOL_LIMIT = 72;
const CHART_POOL_LIMIT = 60;

const createEmptySignal = (): BookSignal => ({
  reviewCount: 0,
  ratingSum: 0,
  readerCount: 0,
  bookmarkCount: 0,
});

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, value));
}

function computeBookScore(signal: BookSignal): number {
  const averageRating = signal.reviewCount > 0 ? signal.ratingSum / signal.reviewCount : 0;
  const score =
    averageRating * 24 +
    signal.reviewCount * 4 +
    signal.readerCount * 2.6 +
    signal.bookmarkCount * 3.2;

  return Number(score.toFixed(2));
}

async function resolveAvatarUrl(avatarPath: string | null | undefined): Promise<string | null> {
  if (!avatarPath) return null;
  try {
    return await getAvatarUrlFromPathServer(avatarPath);
  } catch {
    return null;
  }
}

export default async function ReaderHomePage() {
  let supabase: Awaited<ReturnType<typeof createClient>>;

  try {
    supabase = await createClient();
  } catch {
    return (
      <div className="section-gap-lg">
        <ErrorState
          title="Something went wrong"
          description="Could not load the page. Please try again later."
          action={
            <Link href="/reader/home" className="btn-primary rounded-full px-5 py-2.5 text-[14px]">
              Try again
            </Link>
          }
        />
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let readerName: string | null = null;

  try {
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed_at, display_name, username")
        .eq("user_id", user.id)
        .maybeSingle();

      if (getRecommendationsEnabled() && !profile?.onboarding_completed_at) {
        redirect("/reader/onboarding");
      }

      readerName = profile?.display_name || profile?.username || null;
    }
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // Swallow profile/application fetch errors; page renders with defaults.
  }

  let continueReading: ContinueReadingBook[] = [];

  try {
    if (user) {
      const { data: readings } = await supabase
        .from("readings")
        .select("book_id, progress_percent, updated_at, chapter_id")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(8);

      if (readings && readings.length > 0) {
        const bookIds = readings.map((row) => row.book_id);
        const { data: books } = await supabase
          .from("books")
          .select("id, title, cover_image, author_id")
          .eq("status", "PUBLISHED")
          .in("id", bookIds);

        if (books && books.length > 0) {
          const bookMap = new Map(books.map((book) => [book.id, book]));
          const authorIds = [...new Set(books.map((book) => book.author_id))];

          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, display_name, username")
            .in("user_id", authorIds);

          const authorMap = new Map(
            (profiles ?? []).map((profile) => [
              profile.user_id,
              profile.display_name || profile.username || "Author",
            ])
          );

          continueReading = readings
            .map((row) => {
              const book = bookMap.get(row.book_id);
              if (!book) return null;

              const directHref = row.chapter_id ? `/reader/read/${row.chapter_id}` : `/reader/books/${book.id}`;
              return {
                id: book.id,
                title: book.title,
                author: authorMap.get(book.author_id) ?? "Author",
                cover: book.cover_image,
                progress: row.progress_percent ?? 0,
                href: directHref,
              };
            })
            .filter((book): book is ContinueReadingBook => book !== null);
        }
      }
    }
  } catch {
    // Swallow; continue reading rail will be empty.
  }

  let publishedWithAuthors: PublishedBook[] = [];
  let newReleases: PublishedBook[] = [];
  let topChart: ChartBook[] = [];
  let trendingAuthors: AuthorMomentum[] = [];
  let totalPublishedCount = 0;
  let totalAuthorCount = 0;

  try {
    const { data: books } = await supabase
      .from("books")
      .select("id, title, cover_image, author_id, published_at, updated_at")
      .eq("status", "PUBLISHED")
      .order("published_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(BOOK_POOL_LIMIT);

    const bookPool = books ?? [];
    totalPublishedCount = bookPool.length;

    const authorIds = [...new Set(bookPool.map((book) => book.author_id))];
    totalAuthorCount = authorIds.length;

    let profileMap = new Map<string, ProfileLite>();

    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, avatar_url, bio")
        .in("user_id", authorIds);

      profileMap = new Map(
        (profiles ?? []).map((profile) => [
          profile.user_id,
          {
            name: profile.display_name || profile.username || "Author",
            avatarPath: profile.avatar_url,
            bio: profile.bio,
          },
        ])
      );
    }

    publishedWithAuthors = bookPool.map((book) => ({
      id: book.id,
      title: book.title,
      authorId: book.author_id,
      author: profileMap.get(book.author_id)?.name ?? "Author",
      cover: book.cover_image,
      publishedAt: book.published_at,
      updatedAt: book.updated_at,
    }));

    newReleases = publishedWithAuthors.slice(0, 14);

    const candidateBookIds = publishedWithAuthors.slice(0, CHART_POOL_LIMIT).map((book) => book.id);
    const signalByBook = new Map<string, BookSignal>();
    candidateBookIds.forEach((bookId) => {
      signalByBook.set(bookId, createEmptySignal());
    });

    if (candidateBookIds.length > 0) {
      const [reviewsResult, readingsResult, bookmarksResult] = await Promise.all([
        supabase
          .from("reviews")
          .select("book_id, rating")
          .in("book_id", candidateBookIds)
          .limit(1000),
        supabase
          .from("readings")
          .select("book_id")
          .in("book_id", candidateBookIds)
          .limit(1000),
        supabase
          .from("bookmarks")
          .select("book_id")
          .in("book_id", candidateBookIds)
          .limit(1000),
      ]);

      (reviewsResult.data ?? []).forEach((row) => {
        const signal = signalByBook.get(row.book_id);
        if (!signal) return;
        signal.reviewCount += 1;
        signal.ratingSum += Number(row.rating ?? 0);
      });

      (readingsResult.data ?? []).forEach((row) => {
        const signal = signalByBook.get(row.book_id);
        if (!signal) return;
        signal.readerCount += 1;
      });

      (bookmarksResult.data ?? []).forEach((row) => {
        const signal = signalByBook.get(row.book_id);
        if (!signal) return;
        signal.bookmarkCount += 1;
      });
    }

    topChart = publishedWithAuthors
      .filter((book) => signalByBook.has(book.id))
      .map((book) => {
        const signal = signalByBook.get(book.id) ?? createEmptySignal();
        const score = computeBookScore(signal);
        const averageRating =
          signal.reviewCount > 0
            ? Number((signal.ratingSum / signal.reviewCount).toFixed(1))
            : null;

        return {
          ...book,
          score,
          averageRating,
          reviewCount: signal.reviewCount,
          readerCount: signal.readerCount,
          bookmarkCount: signal.bookmarkCount,
        };
      })
      .filter((book) => book.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (topChart.length === 0) {
      topChart = publishedWithAuthors.slice(0, 10).map((book) => ({
        ...book,
        score: 0,
        averageRating: null,
        reviewCount: 0,
        readerCount: 0,
        bookmarkCount: 0,
      }));
    }

    const authorMomentumMap = new Map<
      string,
      {
        id: string;
        bookCount: number;
        score: number;
        reviewCount: number;
        readerCount: number;
        bookmarkCount: number;
        latestAt: number;
      }
    >();

    publishedWithAuthors.slice(0, CHART_POOL_LIMIT).forEach((book) => {
      const signal = signalByBook.get(book.id) ?? createEmptySignal();
      const bookScore = computeBookScore(signal);
      const publishedTimestamp = Date.parse(book.publishedAt ?? book.updatedAt);
      const existing = authorMomentumMap.get(book.authorId);

      if (!existing) {
        authorMomentumMap.set(book.authorId, {
          id: book.authorId,
          bookCount: 1,
          score: bookScore,
          reviewCount: signal.reviewCount,
          readerCount: signal.readerCount,
          bookmarkCount: signal.bookmarkCount,
          latestAt: Number.isNaN(publishedTimestamp) ? 0 : publishedTimestamp,
        });
        return;
      }

      existing.bookCount += 1;
      existing.score += bookScore;
      existing.reviewCount += signal.reviewCount;
      existing.readerCount += signal.readerCount;
      existing.bookmarkCount += signal.bookmarkCount;
      existing.latestAt = Math.max(existing.latestAt, Number.isNaN(publishedTimestamp) ? 0 : publishedTimestamp);
    });

    const momentumSorted = Array.from(authorMomentumMap.values())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.readerCount !== a.readerCount) return b.readerCount - a.readerCount;
        return b.latestAt - a.latestAt;
      })
      .slice(0, 10);

    trendingAuthors = await Promise.all(
      momentumSorted.map(async (entry) => {
        const profile = profileMap.get(entry.id);
        const avatar = await resolveAvatarUrl(profile?.avatarPath);

        const genre =
          entry.bookCount >= 4
            ? "Established storyteller"
            : entry.reviewCount >= 8
              ? "Reader favorite"
              : "Rising creator";

        const meta = `${entry.bookCount} books live - ${compactNumber(entry.readerCount + entry.bookmarkCount)} active readers`;

        return {
          id: entry.id,
          name: profile?.name ?? "Author",
          avatar,
          genre,
          meta,
        };
      })
    );

    if (trendingAuthors.length === 0) {
      trendingAuthors = await Promise.all(
        Array.from(
          publishedWithAuthors.reduce((map, book) => {
            const existing = map.get(book.authorId) ?? {
              id: book.authorId,
              name: profileMap.get(book.authorId)?.name ?? "Author",
              bookCount: 0,
            };
            existing.bookCount += 1;
            map.set(book.authorId, existing);
            return map;
          }, new Map<string, { id: string; name: string; bookCount: number }>()).values()
        )
          .sort((a, b) => b.bookCount - a.bookCount)
          .slice(0, 8)
          .map(async (entry) => {
            const profile = profileMap.get(entry.id);
            const avatar = await resolveAvatarUrl(profile?.avatarPath);

            return {
              id: entry.id,
              name: entry.name,
              avatar,
              genre: "Published author",
              meta: `${entry.bookCount} books live`,
            };
          })
      );
    }
  } catch {
    // Swallow; rails render as empty states.
  }

  const spotlight: Spotlight | null = continueReading[0]
    ? {
        title: continueReading[0].title,
        author: continueReading[0].author,
        cover: continueReading[0].cover,
        href: continueReading[0].href,
        badge: "Continue reading",
        caption: `${Math.round(Math.max(0, continueReading[0].progress))}% completed`,
        progress: continueReading[0].progress,
      }
    : topChart[0]
      ? {
          title: topChart[0].title,
          author: topChart[0].author,
          cover: topChart[0].cover,
          href: `/reader/books/${topChart[0].id}`,
          badge: "#1 in Top chart",
          caption:
            topChart[0].averageRating != null
              ? `${topChart[0].averageRating.toFixed(1)} average rating`
              : "Trending strongly this week",
        }
      : newReleases[0]
        ? {
            title: newReleases[0].title,
            author: newReleases[0].author,
            cover: newReleases[0].cover,
            href: `/reader/books/${newReleases[0].id}`,
            badge: "Fresh release",
            caption: "Recently published",
          }
        : null;

  const greeting = readerName ? `Welcome back, ${readerName.split(" ")[0]}` : "Welcome back";
  const top5Chart = topChart.slice(0, 5);

  return (
    <>
      {/* Hero: 8px grid, lifted shadow */}
      <section className="relative mb-12 min-h-0 w-full overflow-hidden rounded-b-[24px] bg-[#f5f5f7] shadow-[0_24px_48px_-20px_rgba(15,23,42,0.12),0_12px_24px_-8px_rgba(15,23,42,0.08)] dark:bg-[#0a0a0a] dark:shadow-[0_24px_48px_-12px_rgba(15,23,42,0.35)]">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-transparent to-blue-500/10 dark:from-white/[0.02] dark:to-transparent" aria-hidden />
        <div className="relative z-10">
          {/* Same horizontal padding everywhere for alignment */}
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10">
            <div className="py-10 sm:py-12">
              {/* Row 1: cover left, title + CTA right — 8px rhythm */}
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-12">
                {spotlight?.cover ? (
                  <Link
                    href={spotlight.href}
                    className="block w-full max-w-[180px] overflow-hidden rounded-xl shadow-lg ring-1 ring-neutral-200/80 transition hover:ring-neutral-300 dark:ring-neutral-700 dark:hover:ring-neutral-600 sm:max-w-[200px] lg:max-w-[220px]"
                  >
                    <div className="aspect-[2/3] w-full bg-neutral-200 dark:bg-neutral-800">
                      <Image
                        src={spotlight.cover}
                        alt={spotlight.title}
                        width={220}
                        height={330}
                        className="h-full w-full object-cover object-center"
                        unoptimized
                        sizes="(max-width: 1024px) 200px, 220px"
                      />
                    </div>
                  </Link>
                ) : null}
                <div className="flex min-w-0 flex-col justify-center">
                  {spotlight ? (
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                      {spotlight.badge}
                    </span>
                  ) : null}
                  <h1 className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-tight text-neutral-900 dark:text-white sm:text-[2.25rem] md:text-[2.5rem]">
                    {spotlight ? spotlight.title : greeting}
                  </h1>
                  <p className="mt-2 text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-300">
                    {spotlight ? spotlight.author : "Your reading lounge. Continue where you left off, or discover something new."}
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    {spotlight ? (
                      <Link
                        href={spotlight.href}
                        className="inline-flex h-10 items-center justify-center rounded-full bg-neutral-900 px-5 text-[14px] font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                      >
                        Open
                      </Link>
                    ) : null}
                    <Link
                      href="/reader/discover"
                      className="inline-flex h-10 items-center justify-center rounded-full bg-neutral-900 px-5 text-[14px] font-medium text-white transition hover:bg-neutral-800 dark:bg-white/15 dark:text-white dark:hover:bg-white/25"
                    >
                      Discover
                    </Link>
                    <Link
                      href="/reader/library"
                      className="inline-flex h-10 items-center justify-center rounded-full border border-neutral-300 bg-transparent px-5 text-[14px] font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      My library
                    </Link>
                  </div>
                  {spotlight && typeof spotlight.progress === "number" ? (
                    <div className="mt-4 h-1.5 w-full max-w-[240px] rounded-full bg-neutral-200 dark:bg-neutral-700">
                      <div
                        className="h-full rounded-full bg-neutral-600 dark:bg-white"
                        style={{ width: `${Math.min(Math.max(spotlight.progress, 0), 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Row 2: Top 5 — same left edge, 8px rhythm */}
              {top5Chart.length > 0 ? (
                <div className="mt-10 border-t border-neutral-200/80 pt-8 dark:border-neutral-800">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                      Top in chart
                    </span>
                    <Link href="#top-chart" className="text-[12px] font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
                      See all
                    </Link>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-1">
                  {top5Chart.map((book, i) => (
                    <Link
                      key={book.id}
                      href={`/reader/books/${book.id}`}
                      className="relative flex-shrink-0 overflow-hidden rounded-lg ring-1 ring-neutral-200/60 transition hover:ring-neutral-400 dark:ring-neutral-600 dark:hover:ring-neutral-500"
                    >
                      <div className="aspect-[2/3] w-[88px] sm:w-[100px]">
                        {book.cover ? (
                          <Image
                            src={book.cover}
                            alt={book.title}
                            width={100}
                            height={150}
                            className="h-full w-full object-cover"
                            unoptimized
                            sizes="100px"
                          />
                        ) : (
                          <div className="h-full w-full bg-neutral-300 dark:bg-neutral-700" />
                        )}
                      </div>
                      <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900/90 text-[11px] font-bold text-white dark:bg-white/95 dark:text-neutral-900">
                        {i + 1}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10">
        <ErrorBannerWrapper />
      </div>

      <div className="mx-auto w-full max-w-7xl space-y-10 px-4 sm:px-6 lg:px-10">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4 xl:gap-8">
        <div className="card-base-subtle text-left">
          <p className="px-5 pt-5 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-white/50">Open books</p>
          <p className="mt-2 px-5 text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">{continueReading.length}</p>
          <p className="mt-1 px-5 pb-5 text-[12px] text-slate-500 dark:text-white/50">Ready to continue right now</p>
        </div>
        <div className="card-base-subtle text-left">
          <p className="px-5 pt-5 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-white/50">Top chart books</p>
          <p className="mt-2 px-5 text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">{topChart.length}</p>
          <p className="mt-1 px-5 pb-5 text-[12px] text-slate-500 dark:text-white/50">Picked from current reader activity</p>
        </div>
        <div className="card-base-subtle text-left">
          <p className="px-5 pt-5 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-white/50">Public releases</p>
          <p className="mt-2 px-5 text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">{totalPublishedCount}</p>
          <p className="mt-1 px-5 pb-5 text-[12px] text-slate-500 dark:text-white/50">Published books currently available</p>
        </div>
        <div className="card-base-subtle text-left">
          <p className="px-5 pt-5 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-white/50">Active authors</p>
          <p className="mt-2 px-5 text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">{totalAuthorCount}</p>
          <p className="mt-1 px-5 pb-5 text-[12px] text-slate-500 dark:text-white/50">Creators publishing on the platform</p>
        </div>
      </section>

      <div id="continue-reading" className="scroll-mt-24">
        <Rail
          title="Continue reading"
          description="Jump straight back into your latest chapters"
          isEmpty={continueReading.length === 0}
          emptyState={
            <EmptyState
              title="Your shelf is quiet"
              description="Start a book and it will appear here with progress tracking."
              action={
                <Link
                  href="/reader/discover"
                  className="btn-primary rounded-full bg-slate-900 px-5 py-2.5 text-[14px] hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/95"
                >
                  Explore stories
                </Link>
              }
            />
          }
        >
          {continueReading.map((book) => (
            <BookCard
              key={book.id}
              id={book.id}
              title={book.title}
              author={book.author}
              cover={book.cover}
              progress={book.progress}
              href={book.href}
              ctaLabel="Continue"
              size="lg"
            />
          ))}
        </Rail>
      </div>

      {user && <ForYouRail userId={user.id} />}

      <div id="top-chart" className="scroll-mt-24">
        <Rail
          title="Top chart"
          description="Books with the strongest reading momentum right now"
          action={
            <Link href="/reader/discover" className="btn-ghost py-1.5 text-[13px]">
              View discovery
            </Link>
          }
          isEmpty={topChart.length === 0}
          emptyState={
            <p className="text-[14px] text-slate-500 dark:text-white/50">
              Top chart is warming up. Published books will appear here soon.
            </p>
          }
        >
          {topChart.map((book, index) => {
            const helperText =
              book.reviewCount > 0
                ? `${book.reviewCount} reviews`
                : book.readerCount > 0
                  ? `${book.readerCount} readers`
                  : undefined;

            return (
              <BookCard
                key={book.id}
                id={book.id}
                title={book.title}
                author={book.author}
                cover={book.cover}
                tag={`#${index + 1}`}
                rating={book.averageRating ?? undefined}
                length={helperText}
                size="lg"
              />
            );
          })}
        </Rail>
      </div>

      <section id="popular-authors" className="space-y-5 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-section-title">Popular authors</h2>
            <p className="text-helper">Creators readers are currently returning to</p>
          </div>
          <Link href="/reader/authors" className="btn-ghost py-1.5 text-[13px]">
            See all authors
          </Link>
        </div>

        {trendingAuthors.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-2 pr-2 -mx-1">
            {trendingAuthors.map((author) => (
              <AuthorCard
                key={author.id}
                name={author.name}
                avatar={author.avatar}
                genre={author.genre}
                meta={author.meta}
                href={`/reader/authors/${author.id}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-slate-500 dark:text-white/50">
            No author activity yet. As books are published, this list fills automatically.
          </p>
        )}
      </section>

      <div id="new-releases" className="scroll-mt-24">
        <Rail
          title="New releases"
          description="Latest public books published on Verkli"
          action={
            <Link href="/reader/discover" className="btn-ghost py-1.5 text-[13px]">
              See all
            </Link>
          }
          isEmpty={newReleases.length === 0}
          emptyState={
            <p className="text-[14px] text-slate-500 dark:text-white/50">
              No published books yet. Check back soon.
            </p>
          }
        >
          {newReleases.map((book) => (
            <BookCard
              key={book.id}
              id={book.id}
              title={book.title}
              author={book.author}
              cover={book.cover}
            />
          ))}
        </Rail>
      </div>
      </div>
    </>
  );
}
