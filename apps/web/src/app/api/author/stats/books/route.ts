import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import {
  classifyStatsEvent,
  fetchAllRows,
  resolveAuthorBooks,
  SETTLED_PAYMENT_STATUS,
} from "@/lib/author/stats-scope";
import {
  apiError,
  E_DATABASE_ERROR,
} from "@/lib/api-errors";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "all"]).default("30d"),
});

export async function GET(request: Request) {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    period: url.searchParams.get("period") ?? undefined,
  });
  const period = parsed.success ? parsed.data.period : "30d";

  // Ownership comes from the session client, so RLS decides which books are
  // this author's. Everything below is scoped to that answer.
  const owned = await resolveAuthorBooks(supabase, user.id);
  if (!owned.ok) {
    console.error("[author/stats/books] books load failed", {
      userId: user.id,
      message: owned.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (owned.books.length === 0) {
    return NextResponse.json({ books: [] });
  }

  const { books, bookIds } = owned;

  // analytics_events has an INSERT policy and no SELECT policy, so the author
  // session reads nothing. Service role is the only way to see these counts —
  // which makes the book_id filter load-bearing rather than an optimisation.
  const admin = createAdminClient();

  const since =
    period === "7d" || period === "30d"
      ? (() => {
          const d = new Date();
          d.setDate(d.getDate() - (period === "7d" ? 7 : 30));
          return d;
        })()
      : null;

  // Paged: a plain select stops at PostgREST's max_rows = 1000 with no error,
  // which turns per-book totals into per-book "first thousand events".
  const { rows: events, error: eventsError } = await fetchAllRows<{
    event_type?: string | null;
    event_name?: string | null;
    book_id: string | null;
  }>((from, to) => {
    let q = admin
      .from("analytics_events")
      .select("event_type, event_name, book_id")
      .in("book_id", bookIds);
    if (since) q = q.gte("created_at", since.toISOString());
    return q.order("id", { ascending: true }).range(from, to);
  });

  if (eventsError) {
    console.error("[author/stats/books] analytics load failed", {
      userId: user.id,
      message: eventsError,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  // Build per-book stats
  const statsMap = new Map<string, { views: number; reads: number; purchases: number }>();
  for (const id of bookIds) {
    statsMap.set(id, { views: 0, reads: 0, purchases: 0 });
  }

  for (const event of events) {
    // book_id is the canonical link, so no substring matching against path —
    // `start_reading` writes /reader/read/<chapterId>, which never contains the
    // book id and would silently drop every read.
    const bookId = (event.book_id as string | null) ?? "";
    const entry = statsMap.get(bookId);
    if (!entry) continue;

    const kind = classifyStatsEvent(event as { event_type?: string | null; event_name?: string | null });
    if (kind === "view") entry.views++;
    else if (kind === "read") entry.reads++;
  }

  // Purchases come from settled orders, not analytics_events: that table's RLS
  // insert policy lets any client forge a purchase for any book.
  let ordersQuery = admin
    .from("orders")
    .select("book_id")
    .in("book_id", bookIds)
    .eq("status", SETTLED_PAYMENT_STATUS);
  if (since) ordersQuery = ordersQuery.gte("created_at", since.toISOString());

  const { rows: paidOrders, error: ordersError } = await fetchAllRows<{
    book_id: string | null;
  }>((from, to) => ordersQuery.order("id", { ascending: true }).range(from, to));

  if (ordersError) {
    console.error("[author/stats/books] orders load failed", {
      userId: user.id,
      message: ordersError,
    });
  }

  for (const order of paidOrders) {
    const entry = statsMap.get((order.book_id as string | null) ?? "");
    if (entry) entry.purchases++;
  }

  const result = books
    .map((book) => ({
      id: book.id,
      title: book.title,
      ...(statsMap.get(book.id) ?? { views: 0, reads: 0, purchases: 0 }),
    }))
    .sort((a, b) => b.views - a.views);

  return NextResponse.json({ books: result });
}
