import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
} from "@/lib/api-errors";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "all"]).default("30d"),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuthorRoleForApi();
  if (auth.response) return auth.response;

  const { id: bookId } = await context.params;
  const userId = auth.user.id;

  const supabase = await createClient();

  // Verify ownership
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, title, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) return apiError(E_DATABASE_ERROR, 500);
  if (!book || book.author_id !== userId) return apiError(E_BOOK_NOT_FOUND, 404);

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
  const dailyMap = new Map<string, { views: number; reads: number }>();

  try {
    let eventsQuery = supabase
      .from("analytics_events")
      .select("event_name, path, created_at")
      .limit(10000);

    if (since) {
      eventsQuery = eventsQuery.gte("created_at", since.toISOString());
    }

    const { data: events } = await eventsQuery;

    for (const event of events ?? []) {
      const path = (event.path as string) ?? "";
      if (!path.includes(bookId)) continue;

      const name = ((event.event_name as string) ?? "").toLowerCase();
      const day = (event.created_at as string).slice(0, 10);

      if (!dailyMap.has(day)) dailyMap.set(day, { views: 0, reads: 0 });
      const dayEntry = dailyMap.get(day)!;

      if (name.includes("read") || name.includes("chapter_read")) {
        reads++;
        dayEntry.reads++;
      } else if (name.includes("purchase") || name.includes("checkout")) {
        purchases++;
      } else if (!name.includes("bookmark") && !name.includes("save")) {
        views++;
        dayEntry.views++;
      }
    }
  } catch {
    // analytics_events may not exist or be inaccessible — continue with zeros
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
    const { count } = await supabase
      .from("readings")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId);

    totalReaders = count ?? 0;

    const { data } = await supabase
      .from("readings")
      .select("progress_percent, last_read_at, current_chapter, chapter_id")
      .eq("book_id", bookId);

    readingsData = (data ?? []) as typeof readingsData;

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
  } catch {
    // readings table may not exist — continue with zeros
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
    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating, content, created_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(10);

    recentReviews = (reviews ?? []) as typeof recentReviews;
    reviewCount = recentReviews.length;
    if (reviewCount > 0) {
      averageRating =
        Math.round(
          (recentReviews.reduce(
            (sum, r) => sum + (Number(r.rating) || 0),
            0,
          ) /
            reviewCount) *
            10,
        ) / 10;
    }
  } catch {
    // reviews table may not exist — continue with zeros
  }

  // ── Bookmarks ──
  let bookmarkCount = 0;
  try {
    const { count } = await supabase
      .from("bookmarks")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId);
    bookmarkCount = count ?? 0;
  } catch {
    // bookmarks table may not exist
  }

  // ── Revenue ──
  let revenue = 0;
  try {
    const { data: orders } = await supabase
      .from("orders")
      .select("amount")
      .eq("book_id", bookId)
      .eq("status", "completed");

    for (const order of orders ?? []) {
      revenue += Number(order.amount) || 0;
    }
  } catch {
    // orders table may not exist
  }

  // Daily chart data (sorted by date)
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
      const { data: highlights } = await supabase
        .from("highlights" as never)
        .select("chapter_id")
        .eq("book_id", bookId);
      highlightRows = (highlights ?? []) as typeof highlightRows;
    } catch {
      // highlights table may not exist — continue with zeros
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
      currency: "SEK",
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
