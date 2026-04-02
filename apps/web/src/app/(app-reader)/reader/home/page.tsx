import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";
import { getRecommendationsEnabled } from "@/lib/flags";
import { ErrorBannerWrapper } from "@/components/ui/ErrorBanner";
import { ErrorState } from "@/components/ui/states";
import ReaderHomePageView from "@/features/reader/reader-home/ReaderHomePageView";

type ContinueReadingBook = {
  id: string;
  title: string;
  authorId: string;
  author: string;
  cover: string | null;
  progress: number;
  href: string;
  chapterLabel?: string | null;
  lastOpenedLabel?: string | null;
};

type PublishedBook = {
  id: string;
  title: string;
  authorId: string;
  author: string;
  cover: string | null;
  publishedAt: string | null;
  updatedAt: string;
  trailerUrl: string | null;
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

function formatDateLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function takeUniqueBooks<T extends { id: string }>(
  books: T[],
  seenIds: Set<string>,
  limit: number
): T[] {
  const unique: T[] = [];

  for (const book of books) {
    if (seenIds.has(book.id)) continue;
    seenIds.add(book.id);
    unique.push(book);
    if (unique.length >= limit) break;
  }

  return unique;
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
      <div>
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
        const chapterIds = [...new Set(readings.map((row) => row.chapter_id).filter(Boolean))];

        const { data: books } = await supabase
          .from("books")
          .select("id, title, cover_image, author_id")
          .eq("status", "PUBLISHED")
          .in("id", bookIds);

        if (books && books.length > 0) {
          const bookMap = new Map(books.map((book) => [book.id, book]));
          const authorIds = [...new Set(books.map((book) => book.author_id))];

          const [{ data: profiles }, { data: chapterRows }] = await Promise.all([
            supabase
              .from("profiles")
              .select("user_id, display_name, username")
              .in("user_id", authorIds),
            chapterIds.length > 0
              ? supabase.from("chapters").select("id, title").in("id", chapterIds)
              : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
          ]);

          const authorMap = new Map(
            (profiles ?? []).map((profile) => [
              profile.user_id,
              profile.display_name || profile.username || "Author",
            ])
          );

          const chapterMap = new Map(
            (chapterRows ?? []).map((chapter) => [chapter.id, chapter.title])
          );

          continueReading = readings
            .map((row): ContinueReadingBook | null => {
              const book = bookMap.get(row.book_id);
              if (!book) return null;

              const directHref = row.chapter_id ? `/reader/read/${row.chapter_id}` : `/reader/books/${book.id}`;
              const lastOpened = formatDateLabel(row.updated_at);

              return {
                id: book.id as string,
                title: book.title as string,
                authorId: book.author_id as string,
                author: authorMap.get(book.author_id) ?? "Author",
                cover: book.cover_image as string | null,
                progress: (row.progress_percent as number) ?? 0,
                href: directHref,
                chapterLabel: row.chapter_id ? chapterMap.get(row.chapter_id) ?? null : null,
                lastOpenedLabel: lastOpened ? `Last opened ${lastOpened}` : null,
              };
            })
            .filter((book): book is ContinueReadingBook => book !== null);
        }
      }
    }
  } catch {
    // Non-blocking. Continue reading can render empty.
  }

  let readingStats = { booksReading: 0, booksFinished: 0, bookmarksCount: 0 };

  try {
    if (user) {
      const [readingCountRes, finishedCountRes, bookmarkCountRes] =
        await Promise.all([
          supabase
            .from("readings")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .lt("progress_percent", 99),
          supabase
            .from("readings")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("progress_percent", 99),
          supabase
            .from("bookmarks")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);

      readingStats = {
        booksReading: readingCountRes.count ?? 0,
        booksFinished: finishedCountRes.count ?? 0,
        bookmarksCount: bookmarkCountRes.count ?? 0,
      };
    }
  } catch {
    // Non-blocking
  }

  let publishedWithAuthors: PublishedBook[] = [];
  let newReleases: PublishedBook[] = [];
  let topChart: ChartBook[] = [];
  let trendingAuthors: AuthorMomentum[] = [];

  try {
    const { data: books } = await supabase
      .from("books")
      .select("id, title, cover_image, author_id, published_at, updated_at")
      .eq("status", "PUBLISHED")
      .order("published_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(BOOK_POOL_LIMIT);

    const bookPool = books ?? [];
    const authorIds = [...new Set(bookPool.map((book) => book.author_id))];

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
      trailerUrl: (book as { trailer_url?: string | null }).trailer_url ?? null,
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

        return {
          id: entry.id,
          name: profile?.name ?? "Author",
          avatar,
          genre,
          meta: `${entry.bookCount} books live · ${compactNumber(entry.readerCount + entry.bookmarkCount)} active readers`,
        };
      })
    );
  } catch {
    // Non-blocking. Rails can render empty.
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
          badge: "#1 in trending",
          caption:
            topChart[0].averageRating != null
              ? `${topChart[0].averageRating.toFixed(1)} average rating`
              : "Readers are opening this book right now",
        }
      : newReleases[0]
        ? {
            title: newReleases[0].title,
            author: newReleases[0].author,
            cover: newReleases[0].cover,
            href: `/reader/books/${newReleases[0].id}`,
            badge: "Fresh release",
            caption: "Recently published and ready to open",
          }
        : null;

  const greeting = readerName ? `Welcome back, ${readerName.split(" ")[0]}` : "Welcome back";
  const readingBookIds = new Set(continueReading.map((book) => book.id));
  const activeAuthorIds = new Set(continueReading.map((book) => book.authorId));
  const consumedBookIds = new Set(readingBookIds);

  if (spotlight?.href.startsWith("/reader/books/")) {
    consumedBookIds.add(spotlight.href.replace("/reader/books/", ""));
  }

  const recommendedPool = publishedWithAuthors
    .filter((book) => activeAuthorIds.has(book.authorId) && !readingBookIds.has(book.id))
    .slice(0, 8);

  if (recommendedPool.length < 8) {
    topChart.forEach((book) => {
      if (recommendedPool.length >= 8) return;
      if (readingBookIds.has(book.id)) return;
      if (recommendedPool.some((candidate) => candidate.id === book.id)) return;
      recommendedPool.push(book);
    });
  }

  const recommendedBooks = takeUniqueBooks(recommendedPool, consumedBookIds, 6);
  const trendingBooks = takeUniqueBooks(topChart, consumedBookIds, 4);
  const latestReleases = takeUniqueBooks(newReleases, consumedBookIds, 4);

  return (
    <div>
      <div className="space-y-6">
        <ErrorBannerWrapper />
        <ReaderHomePageView
          greeting={greeting}
          spotlight={spotlight}
          continueReading={continueReading}
          recommendedBooks={recommendedBooks.map((book) => ({
            id: book.id,
            title: book.title,
            author: book.author,
            cover: book.cover,
            href: `/reader/books/${book.id}`,
            tag: activeAuthorIds.has(book.authorId) ? "By an author you already read" : undefined,
            length: "Recommended next",
            hasTrailer: Boolean(book.trailerUrl),
          }))}
          trendingBooks={trendingBooks.map((book, index) => ({
            id: book.id,
            title: book.title,
            author: book.author,
            cover: book.cover,
            href: `/reader/books/${book.id}`,
            tag: `#${index + 1}`,
            length:
              book.averageRating != null
                ? `${book.averageRating.toFixed(1)} rating`
                : `${compactNumber(book.readerCount + book.bookmarkCount)} readers`,
            hasTrailer: Boolean(book.trailerUrl),
          }))}
          latestReleases={latestReleases.map((book) => ({
            id: book.id,
            title: book.title,
            author: book.author,
            cover: book.cover,
            href: `/reader/books/${book.id}`,
            tag: "New",
            length: formatDateLabel(book.publishedAt) ? `Published ${formatDateLabel(book.publishedAt)}` : undefined,
            hasTrailer: Boolean(book.trailerUrl),
          }))}
          authorHighlights={trendingAuthors.slice(0, 5)}
          readingStats={readingStats}
        />
      </div>
    </div>
  );
}
