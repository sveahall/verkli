import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addToCurrencyTotal,
  dominantCurrencyTotal,
  fetchAllRows,
  minorToMajor,
  SETTLED_PAYMENT_STATUS,
  type CurrencyTotals,
} from "@/lib/author/stats-scope";
import MetricDetailWorkspace from "@/features/author-workspaces/analytics/MetricDetailWorkspace";

const VALID_METRICS = ["sales", "readers", "subscribers", "comments", "reviews"] as const;
type Metric = (typeof VALID_METRICS)[number];

function isValidMetric(value: string): value is Metric {
  return (VALID_METRICS as readonly string[]).includes(value);
}

export default async function MetricDetailPage({
  params,
}: {
  params: Promise<{ metric: string }>;
}) {
  const { metric } = await params;

  if (!isValidMetric(metric)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  // Fetch author's books
  const { data: bookRows } = await supabase
    .from("books")
    .select("id, title, status, cover_image")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  const books = bookRows ?? [];
  const bookIds = books.map((b) => b.id);

  if (bookIds.length === 0) {
    return (
      <MetricDetailWorkspace
        metric={metric}
        summary={{ total: 0, change: 0 }}
        rows={[]}
        books={books.map((b) => ({ id: b.id, title: b.title ?? "Untitled" }))}
      />
    );
  }

  // Same split as the dashboard that links here: ownership was decided above by
  // the RLS-backed books query, and the per-metric reads below run as service
  // role scoped to `bookIds`. Without this the drill-down renders an empty list
  // under a non-zero headline number, which reads as a bug in the count.
  const admin = createAdminClient();

  let summary: {
    total: number;
    change: number;
    currency?: string;
    activeCount?: number;
    totalCount?: number;
    avgRating?: number;
  } = { total: 0, change: 0 };
  let rows: Array<Record<string, unknown>> = [];

  if (metric === "sales") {
    const { data: orders } = await admin
      .from("orders")
      .select("id, book_id, amount, currency, status, country, created_at")
      .in("book_id", bookIds)
      .order("created_at", { ascending: false })
      .limit(100);

    const orderList = orders ?? [];

    // The row limit above is for the table. Summing it would report only the
    // newest 100 orders as this author's total revenue, which is worse than
    // the zero it replaced — a wrong number reads as authoritative. Paged,
    // because PostgREST caps a plain select at max_rows = 1000.
    const { rows: allPaidOrders } = await fetchAllRows<{
      amount: number | string | null;
      currency: string | null;
    }>((from, to) =>
      admin
        .from("orders")
        .select("amount, currency")
        .in("book_id", bookIds)
        .eq("status", SETTLED_PAYMENT_STATUS)
        .order("id", { ascending: true })
        .range(from, to)
    );

    // Minor units, per currency — the workspace formats this with a bare
    // currency suffix and does no conversion of its own.
    const revenueTotals: CurrencyTotals = new Map();
    for (const order of allPaidOrders) {
      addToCurrencyTotal(revenueTotals, order.currency, Number(order.amount) || 0);
    }

    const headline = dominantCurrencyTotal(revenueTotals);
    summary = { total: headline.total, change: 0, currency: headline.currency };

    const bookTitleById = new Map(books.map((b) => [b.id, b.title ?? "Untitled"]));
    rows = orderList.map((order) => ({
      id: order.id,
      bookTitle: bookTitleById.get(order.book_id) ?? "Unknown book",
      // Minor units in the column, major units in the table — the workspace
      // prints this verbatim next to the currency code.
      amount: minorToMajor(Number(order.amount) || 0),
      currency: (order.currency as string) ?? "SEK",
      status: order.status,
      country: order.country ?? "—",
      date: order.created_at,
    }));
  } else if (metric === "readers") {
    // One paged read serves both the headline and the table. The table is
    // per-book rather than per-reading, so there is nothing to cap: an author
    // has as many rows as they have books.
    // `last_read_at`, not `created_at`: `readings` has no `created_at` column
    // (it has `started_at` and `last_read_at`), so this select used to fail and
    // take the whole readers metric down with it — nought readers and an empty
    // table for an author who had plenty. It surfaces as `latestRead` below,
    // which is last activity rather than first, so `last_read_at` is also the
    // column that actually answers the question being asked.
    const { rows: allReaderRows } = await fetchAllRows<{
      user_id: string | null;
      book_id: string;
      last_read_at: string;
    }>((from, to) =>
      admin
        .from("readings")
        .select("user_id, book_id, last_read_at")
        .in("book_id", bookIds)
        .order("id", { ascending: true })
        .range(from, to)
    );
    const uniqueReaders = new Set(
      allReaderRows.map((r) => r.user_id).filter((id): id is string => Boolean(id))
    );
    summary = { total: uniqueReaders.size, change: 0 };

    const bookTitleById = new Map(books.map((b) => [b.id, b.title ?? "Untitled"]));

    // Group by book across every reading — grouping the 200-row display slice
    // would make the per-book counts sum to less than the headline and could
    // drop whole books off the table.
    const byBook = new Map<string, { count: number; latest: string }>();
    for (const r of allReaderRows) {
      const entry = byBook.get(r.book_id) ?? { count: 0, latest: r.last_read_at };
      entry.count++;
      if (r.last_read_at > entry.latest) entry.latest = r.last_read_at;
      byBook.set(r.book_id, entry);
    }

    rows = [...byBook.entries()].map(([bookId, data]) => ({
      id: bookId,
      bookTitle: bookTitleById.get(bookId) ?? "Unknown book",
      readerCount: data.count,
      latestRead: data.latest,
    }));
  } else if (metric === "subscribers") {
    const { data: subs } = await admin
      .from("newsletter_subscriptions" as never)
      .select("id, email, status, created_at")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    const subList = (subs ?? []) as Array<{
      id: string;
      email: string;
      status: string;
      created_at: string;
    }>;
    const [{ count: activeSubscribers }, { count: totalSubscribers }] = await Promise.all([
      admin
        .from("newsletter_subscriptions" as never)
        .select("id", { count: "exact", head: true })
        .eq("author_id", user.id)
        .eq("status" as never, "active"),
      admin
        .from("newsletter_subscriptions" as never)
        .select("id", { count: "exact", head: true })
        .eq("author_id", user.id),
    ]);
    summary = {
      total: activeSubscribers ?? 0,
      change: 0,
      activeCount: activeSubscribers ?? 0,
      totalCount: totalSubscribers ?? 0,
    };

    rows = subList.map((sub) => ({
      id: sub.id,
      email: sub.email,
      status: sub.status,
      date: sub.created_at,
    }));
  } else if (metric === "comments") {
    const { data: comments } = await admin
      .from("comments")
      .select("id, book_id, author_id, body, created_at")
      .in("book_id", bookIds)
      .neq("author_id", user.id)
      // Admin client bypasses RLS, so the soft-delete policy does not apply.
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    const commentList = comments ?? [];

    // Matches the home card: reader comments, not the author's own replies.
    const { count: commentTotal } = await admin
      .from("comments")
      .select("id", { count: "exact", head: true })
      .in("book_id", bookIds)
      .neq("author_id", user.id)
      .is("deleted_at", null);
    summary = { total: commentTotal ?? commentList.length, change: 0 };

    const bookTitleById = new Map(books.map((b) => [b.id, b.title ?? "Untitled"]));
    rows = commentList.map((c) => ({
      id: c.id,
      bookTitle: bookTitleById.get(c.book_id) ?? "Unknown book",
      content: (c.body as string)?.slice(0, 120) ?? "",
      date: c.created_at,
    }));
  } else if (metric === "reviews") {
    const { data: reviews } = await admin
      .from("reviews")
      .select("id, book_id, user_id, rating, content, created_at")
      .in("book_id", bookIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    const reviewList = reviews ?? [];

    // Total and average span every review; the 200-row limit is the table's.
    const { rows: ratingList } = await fetchAllRows<{ rating: number | string | null }>(
      (from, to) =>
        admin
        .from("reviews")
        .select("rating")
        .in("book_id", bookIds)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to)
    );
    summary = { total: ratingList.length, change: 0 };
    const avgRating =
      ratingList.length > 0
        ? ratingList.reduce((s, r) => s + (Number(r.rating) || 0), 0) /
          ratingList.length
        : 0;
    summary = { total: ratingList.length, change: 0, avgRating };

    const bookTitleById = new Map(books.map((b) => [b.id, b.title ?? "Untitled"]));
    rows = reviewList.map((r) => ({
      id: r.id,
      bookTitle: bookTitleById.get(r.book_id) ?? "Unknown book",
      rating: Number(r.rating) || 0,
      text: (r.content as string)?.slice(0, 120) ?? "",
      date: r.created_at,
      avgRating,
    }));
  }

  return (
    <MetricDetailWorkspace
      metric={metric}
      summary={summary}
      rows={rows}
      books={books.map((b) => ({ id: b.id, title: b.title ?? "Untitled" }))}
    />
  );
}
