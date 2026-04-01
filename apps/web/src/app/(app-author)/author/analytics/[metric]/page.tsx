import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  let summary = { total: 0, change: 0 };
  let rows: Array<Record<string, unknown>> = [];

  if (metric === "sales") {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, book_id, amount, currency, status, country, created_at")
      .in("book_id", bookIds)
      .order("created_at", { ascending: false })
      .limit(100);

    const orderList = orders ?? [];
    const totalRevenue = orderList
      .filter((o) => o.status === "completed" || o.status === "paid")
      .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

    summary = { total: totalRevenue, change: 0 };

    const bookTitleById = new Map(books.map((b) => [b.id, b.title ?? "Untitled"]));
    rows = orderList.map((order) => ({
      id: order.id,
      bookTitle: bookTitleById.get(order.book_id) ?? "Okänd bok",
      amount: Number(order.amount) || 0,
      currency: (order.currency as string) ?? "SEK",
      status: order.status,
      country: order.country ?? "—",
      date: order.created_at,
    }));
  } else if (metric === "readers") {
    const { data: readings } = await supabase
      .from("readings")
      .select("id, book_id, user_id, created_at")
      .in("book_id", bookIds)
      .order("created_at", { ascending: false })
      .limit(200);

    const readingList = readings ?? [];
    const uniqueReaders = new Set(readingList.map((r) => r.user_id));
    summary = { total: uniqueReaders.size, change: 0 };

    const bookTitleById = new Map(books.map((b) => [b.id, b.title ?? "Untitled"]));

    // Group by book
    const byBook = new Map<string, { count: number; latest: string }>();
    for (const r of readingList) {
      const entry = byBook.get(r.book_id) ?? { count: 0, latest: r.created_at };
      entry.count++;
      if (r.created_at > entry.latest) entry.latest = r.created_at;
      byBook.set(r.book_id, entry);
    }

    rows = [...byBook.entries()].map(([bookId, data]) => ({
      id: bookId,
      bookTitle: bookTitleById.get(bookId) ?? "Okänd bok",
      readerCount: data.count,
      latestRead: data.latest,
    }));
  } else if (metric === "subscribers") {
    const { data: subs } = await supabase
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
    const active = subList.filter((s) => s.status === "active");
    summary = { total: active.length, change: 0 };

    rows = subList.map((sub) => ({
      id: sub.id,
      email: sub.email,
      status: sub.status,
      date: sub.created_at,
    }));
  } else if (metric === "comments") {
    const { data: comments } = await supabase
      .from("comments")
      .select("id, book_id, author_id, body, created_at")
      .in("book_id", bookIds)
      .order("created_at", { ascending: false })
      .limit(200);

    const commentList = comments ?? [];
    summary = { total: commentList.length, change: 0 };

    const bookTitleById = new Map(books.map((b) => [b.id, b.title ?? "Untitled"]));
    rows = commentList.map((c) => ({
      id: c.id,
      bookTitle: bookTitleById.get(c.book_id) ?? "Okänd bok",
      content: (c.body as string)?.slice(0, 120) ?? "",
      date: c.created_at,
    }));
  } else if (metric === "reviews") {
    const { data: reviews } = await supabase
      .from("reviews")
      .select("id, book_id, user_id, rating, content, created_at")
      .in("book_id", bookIds)
      .order("created_at", { ascending: false })
      .limit(200);

    const reviewList = reviews ?? [];
    summary = { total: reviewList.length, change: 0 };
    const avgRating =
      reviewList.length > 0
        ? reviewList.reduce((s, r) => s + (Number(r.rating) || 0), 0) /
          reviewList.length
        : 0;

    const bookTitleById = new Map(books.map((b) => [b.id, b.title ?? "Untitled"]));
    rows = reviewList.map((r) => ({
      id: r.id,
      bookTitle: bookTitleById.get(r.book_id) ?? "Okänd bok",
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
