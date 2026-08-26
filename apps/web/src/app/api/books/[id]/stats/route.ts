import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { getBookAsOwner } from "@/lib/books/service";
import {
  addToCurrencyTotal,
  classifyStatsEvent,
  dominantCurrencyTotal,
  fetchAllRows,
  SETTLED_PAYMENT_STATUS,
  type CurrencyTotals,
} from "@/lib/author/stats-scope";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
} from "@/lib/api-errors";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "all"]).default("30d"),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Stats degrade rather than fail: one broken table should not blank the whole
 * panel. But the previous version swallowed errors entirely, so a broken query
 * and a book nobody has read rendered identically as "no activity yet" — and
 * the RLS problem behind these zeros went unnoticed for months. Log, then
 * continue.
 */
function logStatsError(table: string, error: unknown): void {
  if (!error) return;
  console.error("[books/stats] load failed", {
    table,
    message: error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error),
  });
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuthorRoleForApi();
  if (auth.response) return auth.response;

  const { id: bookId } = await context.params;
  const userId = auth.user.id;

  const supabase = await createClient();

  // Verify ownership
  const bookResult = await getBookAsOwner(supabase, bookId, userId, "id, title, author_id");
  if (!bookResult.ok) {
    return apiError(
      bookResult.error === "book_not_found" ? E_BOOK_NOT_FOUND : E_DATABASE_ERROR,
      bookResult.error === "book_not_found" ? 404 : 500,
    );
  }

  // Ownership is now proven above via the session client, so every read below
  // is already constrained to this one book. Service role is required because
  // analytics_events, readings, bookmarks and orders are keyed to the reader or
  // buyer — an author session reads nothing from them and the panel showed
  // zeros that looked like "no activity yet".
  const admin = createAdminClient();

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    period: url.searchParams.get("period") ?? undefined,
  });
  const period = parsed.success ? parsed.data.period : "30d";

  const { data: chapterRows } = await supabase
    .from("chapters")
    .select("id, title, order")
    .eq("book_id", bookId)
    .order("order", { ascending: true });
  const chapters = (chapterRows ?? []) as Array<{
    id: string;
    title: string | null;
    order: number;
  }>;

  // Date filter
  let since: Date | null = null;
  if (period === "7d") {
    since = new Date();
    since.setDate(since.getDate() - 7);
  } else if (period === "30d") {
    since = new Date();
    since.setDate(since.getDate() - 30);
  }

  // ── Analytics events (views, reads, purchases) ──
  let views = 0;
  let reads = 0;
  let purchases = 0;
  // `purchases` is part of the contract AnalyticsCharts expects: it feeds
  // `Math.max(...[d.views, d.reads, d.purchases])`, and one undefined there
  // makes every chart coordinate NaN. This map was views/reads only, which was
  // invisible while the chart had no data to draw at all.
  const dailyMap = new Map<string, { views: number; reads: number; purchases: number }>();

  try {
    // book_id, not a path match: `start_reading` writes
    // /reader/read/<chapterId>, which never contains the book id, so the old
    // filter dropped every read this panel was supposed to show. Paged, because
    // PostgREST caps a plain select at max_rows = 1000 and a truncated total
    // looks exactly like a real one.
    const { rows: events, error: eventsError } = await fetchAllRows<{
      event_type?: string | null;
      event_name?: string | null;
      created_at: string;
    }>((from, to) => {
      let q = admin
        .from("analytics_events")
        .select("event_type, event_name, created_at")
        .eq("book_id", bookId);
      if (since) q = q.gte("created_at", since.toISOString());
      return q.order("id", { ascending: true }).range(from, to);
    });
    if (eventsError) logStatsError("analytics_events", { message: eventsError });

    for (const event of events) {
      const kind = classifyStatsEvent(event as { event_type?: string | null; event_name?: string | null });
      if (!kind) continue;

      const day = (event.created_at as string).slice(0, 10);
      if (!dailyMap.has(day)) dailyMap.set(day, { views: 0, reads: 0, purchases: 0 });
      const dayEntry = dailyMap.get(day)!;

      if (kind === "read") {
        reads++;
        dayEntry.reads++;
      } else if (kind === "view") {
        views++;
        dayEntry.views++;
      }
      // bookmark_added / bookmark_removed are counted from the bookmarks table
      // below, which is authoritative — the events would double-count.
    }
  } catch (err) {
    logStatsError("analytics_events", err);
  }

  // ── Readers from readings table ──
  let totalReaders = 0;
  let avgProgress = 0;
  let activeReaders = 0;
  let completionRate = 0;
  let readingsData: Array<{
    progress_percent: number | null;
    last_read_at: string;
    current_chapter: number | null;
    chapter_id: string | null;
  }> = [];

  try {
    const { count, error: readersCountError } = await admin
      .from("readings")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId);
    logStatsError("readings", readersCountError);

    totalReaders = count ?? 0;

    // Paged: `totalReaders` above is an exact database count, so a truncated
    // sample here would make avgProgress and completionRate disagree with it.
    const { rows, error: readingsError } = await fetchAllRows<
      (typeof readingsData)[number]
    >((from, to) =>
      admin
        .from("readings")
        .select("progress_percent, last_read_at, current_chapter, chapter_id")
        .eq("book_id", bookId)
        .order("id", { ascending: true })
        .range(from, to)
    );
    if (readingsError) logStatsError("readings", { message: readingsError });

    readingsData = rows;

    if (readingsData.length > 0) {
      avgProgress = Math.round(
        readingsData.reduce(
          (sum, r) => sum + (Number(r.progress_percent) || 0),
          0,
        ) / readingsData.length,
      );

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      activeReaders = readingsData.filter(
        (r) => new Date(r.last_read_at) >= sevenDaysAgo,
      ).length;

      const completedReaders = readingsData.filter(
        (r) => (Number(r.progress_percent) || 0) >= 90,
      ).length;
      completionRate = Math.round(
        (completedReaders / readingsData.length) * 100,
      );
    }
  } catch (err) {
    logStatsError("readings", err);
  }

  // ── Reviews ──
  let reviewCount = 0;
  let averageRating = 0;
  let recentReviews: Array<{
    rating: number;
    content: string | null;
    created_at: string;
  }> = [];

  try {
    // Get true total count
    const { count: totalReviewCount, error: reviewCountError } = await admin
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId);
    logStatsError("reviews", reviewCountError);

    reviewCount = totalReviewCount ?? 0;

    // Get all ratings for accurate average (only the rating column, no limit)
    const { data: allRatings, error: ratingsError } = await admin
      .from("reviews")
      .select("rating")
      .eq("book_id", bookId);
    logStatsError("reviews", ratingsError);

    if (allRatings && allRatings.length > 0) {
      averageRating =
        Math.round(
          (allRatings.reduce(
            (sum, r) => sum + (Number(r.rating) || 0),
            0,
          ) /
            allRatings.length) *
            10,
        ) / 10;
    }

    // Get recent reviews for display (limited to 10)
    const { data: reviews, error: recentReviewsError } = await admin
      .from("reviews")
      .select("rating, content, created_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(10);
    logStatsError("reviews", recentReviewsError);

    recentReviews = (reviews ?? []) as typeof recentReviews;
  } catch (err) {
    logStatsError("reviews", err);
  }

  // ── Bookmarks ──
  let bookmarkCount = 0;
  try {
    const { count, error: bookmarksError } = await admin
      .from("bookmarks")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId);
    logStatsError("bookmarks", bookmarksError);
    bookmarkCount = count ?? 0;
  } catch (err) {
    logStatsError("bookmarks", err);
  }

  // Purchases come from settled orders, not analytics_events: that table's RLS
  // insert policy lets any client forge a purchase_completed row for any book.
  // `head: true` counts in the database, so no row cap applies.
  const { rows: paidOrders, error: paidOrdersError } = await fetchAllRows<{
    created_at: string;
    amount: number | string | null;
    currency: string | null;
  }>((from, to) => {
    let q = admin
      .from("orders")
      .select("created_at, amount, currency")
      .eq("book_id", bookId)
      .eq("status", SETTLED_PAYMENT_STATUS);
    if (since) q = q.gte("created_at", since.toISOString());
    return q.order("id", { ascending: true }).range(from, to);
  });
  if (paidOrdersError) logStatsError("orders", { message: paidOrdersError });

  purchases = paidOrders.length;

  for (const order of paidOrders) {
    const day = order.created_at?.slice(0, 10) ?? "";
    if (!day) continue;
    if (!dailyMap.has(day)) dailyMap.set(day, { views: 0, reads: 0, purchases: 0 });
    dailyMap.get(day)!.purchases++;
  }

  // ── Revenue ──
  // Same rows as the purchase count above, so revenue and sales describe the
  // same period. Summing all-time orders next to a 7d sale count was the
  // inconsistency here: one sale, lifetime revenue.
  let revenue = 0;
  let revenueCurrency = "SEK";
  {
    const totals: CurrencyTotals = new Map();
    for (const order of paidOrders) {
      addToCurrencyTotal(totals, order.currency, Number(order.amount) || 0);
    }
    const headline = dominantCurrencyTotal(totals);
    revenue = headline.total;
    if (totals.size > 0) revenueCurrency = headline.currency;
  }

  const dailyChart = [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => ({ date, ...data }));

  let chapterSignals: Array<{
    id: string;
    title: string;
    readerCount: number;
    highlightCount: number;
    completionRate: number;
    dropoffRate: number;
    highlightRate: number;
  }> = [];

  if (chapters.length > 0) {
    let highlightRows: Array<{ chapter_id: string | null }> = [];
    try {
      // Paged like the readings and analytics reads above: a plain select stops
      // at PostgREST's max_rows, and highlightRate would then be computed from
      // the first page while the reader count beside it is exact.
      const { rows, error: highlightsError } = await fetchAllRows<{
        chapter_id: string | null;
      }>((from, to) =>
        admin
          .from("highlights" as never)
          .select("chapter_id")
          .eq("book_id", bookId)
          .order("id", { ascending: true })
          .range(from, to)
      );
      if (highlightsError) logStatsError("highlights", { message: highlightsError });
      highlightRows = rows;
    } catch (err) {
      logStatsError("highlights", err);
    }

    const highlightCountByChapterId = new Map<string, number>();
    for (const highlight of highlightRows) {
      if (!highlight.chapter_id) continue;
      highlightCountByChapterId.set(
        highlight.chapter_id,
        (highlightCountByChapterId.get(highlight.chapter_id) ?? 0) + 1
      );
    }

    chapterSignals = chapters.map((chapter, index) => {
      const reachedReaders = readingsData.filter((reading) => {
        if (reading.chapter_id === chapter.id) return true;
        return typeof reading.current_chapter === "number" && reading.current_chapter >= chapter.order;
      });

      const completedReaders = reachedReaders.filter((reading) => {
        if (typeof reading.current_chapter === "number" && reading.current_chapter > chapter.order) {
          return true;
        }
        const chapterThreshold = ((index + 1) / Math.max(chapters.length, 1)) * 100;
        return (Number(reading.progress_percent) || 0) >= chapterThreshold;
      });

      const stalledReaders = reachedReaders.filter((reading) => {
        const sameChapter =
          reading.chapter_id === chapter.id ||
          reading.current_chapter === chapter.order;
        return sameChapter && (Number(reading.progress_percent) || 0) < 100;
      });

      const readerCount = reachedReaders.length;
      const highlightCount = highlightCountByChapterId.get(chapter.id) ?? 0;
      const completedCount = completedReaders.length;
      const stalledCount = stalledReaders.length;

      return {
        id: chapter.id,
        title: chapter.title?.trim() || `Chapter ${index + 1}`,
        readerCount,
        highlightCount,
        completionRate: readerCount > 0 ? Math.round((completedCount / readerCount) * 100) : 0,
        dropoffRate: readerCount > 0 ? Math.round((stalledCount / readerCount) * 100) : 0,
        highlightRate: readerCount > 0 ? Math.round((highlightCount / readerCount) * 100) : 0,
      };
    });
  }

  return NextResponse.json({
    period,
    overview: {
      views,
      reads,
      purchases,
      bookmarks: bookmarkCount,
      revenue,
      // The currency the revenue is actually denominated in, not a constant.
      currency: revenueCurrency,
    },
    readers: {
      total: totalReaders,
      active: activeReaders,
      avgProgress,
      completionRate,
    },
    reviews: {
      count: reviewCount,
      averageRating,
      recent: recentReviews,
    },
    dailyChart,
    chapterSignals,
  });
}
