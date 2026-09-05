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

  // Ownership resolved through the session client so RLS decides it; the
  // analytics read below runs as service role, scoped to this answer.
  const owned = await resolveAuthorBooks(supabase, user.id);

  if (!owned.ok) {
    console.error("[author/stats] books load failed", {
      userId: user.id,
      message: owned.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const { bookIds } = owned;

  if (bookIds.length === 0) {
    return NextResponse.json({
      views: 0,
      reads: 0,
      purchases: 0,
      bookmarks: 0,
      publishedBooks: 0,
      partial: false,
      period,
    });
  }

  // analytics_events has no author-scoped SELECT policy, so the session client
  // reads nothing and the dashboard showed zeros. Service role sees the rows;
  // the book_id filter is what keeps the read scoped to this author's books.
  const admin = createAdminClient();

  const since =
    period === "7d" || period === "30d"
      ? (() => {
          const d = new Date();
          d.setDate(d.getDate() - (period === "7d" ? 7 : 30));
          return d;
        })()
      : null;

  // Paged: PostgREST caps a plain select at max_rows = 1000, so an active
  // author's overview would silently be computed from their first 1000 events.
  const { rows: events, error: eventsError } = await fetchAllRows<{
    event_type?: string | null;
    event_name?: string | null;
    created_at: string;
  }>((from, to) => {
    let q = admin
      .from("analytics_events")
      .select("event_type, event_name, created_at")
      .in("book_id", bookIds);
    if (since) q = q.gte("created_at", since.toISOString());
    return q.order("id", { ascending: true }).range(from, to);
  });

  if (eventsError) {
    console.error("[author/stats] analytics load failed", {
      userId: user.id,
      message: eventsError,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  // Aggregate events (already filtered server-side to this author's books)
  let views = 0;
  let reads = 0;
  let purchases = 0;
  let bookmarksCount = 0;
  const dailyMap = new Map<string, { views: number; reads: number; purchases: number }>();

  for (const event of events) {
    const kind = classifyStatsEvent(event as { event_type?: string | null; event_name?: string | null });
    if (!kind) continue;

    const day = (event.created_at as string | undefined)?.slice(0, 10) ?? "";
    if (day && !dailyMap.has(day)) dailyMap.set(day, { views: 0, reads: 0, purchases: 0 });
    const dayEntry = day ? dailyMap.get(day)! : null;

    if (kind === "view") {
      views++;
      if (dayEntry) dayEntry.views++;
    } else if (kind === "read") {
      reads++;
      if (dayEntry) dayEntry.reads++;
    } else if (kind === "bookmark_added") {
      bookmarksCount++;
    } else {
      // bookmark_removed — a saved book that was un-saved is not a bookmark.
      bookmarksCount--;
    }
  }

  // Removals can outnumber additions in a window that starts mid-history.
  bookmarksCount = Math.max(0, bookmarksCount);

  // Purchases come from settled orders, never from analytics_events: the RLS
  // insert policy on that table lets any client forge a purchase_completed row
  // for any book, and an author must not be told they sold something they did
  // not. `head: true` makes the database do the counting, so no row cap applies.
  const { rows: paidOrders, error: purchaseError } = await fetchAllRows<{
    created_at: string;
  }>((from, to) => {
    let q = admin
      .from("orders")
      .select("created_at")
      .in("book_id", bookIds)
      .eq("status", SETTLED_PAYMENT_STATUS);
    if (since) q = q.gte("created_at", since.toISOString());
    return q.order("id", { ascending: true }).range(from, to);
  });

  if (purchaseError) {
    console.error("[author/stats] orders load failed", {
      userId: user.id,
      message: purchaseError,
    });
  }

  purchases = paidOrders.length;

  // Merge them into the daily series too. Counting the headline separately from
  // the chart is how the chart ends up flat at zero while the total says
  // otherwise — and a day whose only activity was a sale would vanish.
  for (const order of paidOrders) {
    const day = order.created_at?.slice(0, 10) ?? "";
    if (!day) continue;
    if (!dailyMap.has(day)) dailyMap.set(day, { views: 0, reads: 0, purchases: 0 });
    dailyMap.get(day)!.purchases++;
  }

  const dailyChart = [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({ date, views: d.views, reads: d.reads, purchases: d.purchases }));

  // The dashboard has always read `publishedBooks` off this response and
  // defaulted it to 0. Nothing ever put it here, so the "published books" figure
  // was a hardcoded nought wearing an API call's clothing — and the dashboard
  // paid for a second round trip to fetch it.
  //
  // `status = "PUBLISHED"` is the filter the public routes use
  // (api/public/books/route.ts, reader/discover), so an author's count agrees
  // with what a reader can actually find. `resolveAuthorBooks` deliberately does
  // not filter, since every other figure here counts drafts too.
  const { count: publishedBooks, error: publishedError } = await admin
    .from("books")
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id)
    .eq("status", "PUBLISHED");

  if (publishedError) {
    console.error("[author/stats] published book count failed", {
      userId: user.id,
      message: publishedError.message,
    });
  }

  // A 200 with a zero in it is still a claim. Logging the failure server-side
  // does not reach the author, and the dashboard can only see `response.ok` —
  // so without this flag a failed count renders as an authoritative "0 published
  // books" next to figures that did load. Same bug this commit exists to kill.
  return NextResponse.json({
    views,
    reads,
    purchases,
    bookmarks: bookmarksCount,
    publishedBooks: publishedBooks ?? 0,
    partial: Boolean(publishedError),
    period,
    dailyChart,
  });
}
