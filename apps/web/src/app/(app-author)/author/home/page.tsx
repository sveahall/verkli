import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSprint0DemoBadgeEnabled } from "@/lib/flags";
import {
  addToCurrencyTotal,
  dominantCurrencyTotal,
  fetchAllRows,
  SETTLED_PAYMENT_STATUS,
  type CurrencyTotals,
} from "@/lib/author/stats-scope";
import HomeWorkspace from "@/features/author-workspaces/home/HomeWorkspace";
import type {
  DashboardStats,
  DashboardBook,
  DashboardActivity,
  CountrySale,
} from "@/features/author-workspaces/home/types";

function Sprint0DemoBadge() {
  if (!isSprint0DemoBadgeEnabled()) return null;
  return (
    <div
      role="status"
      data-testid="sprint0-demo-badge"
      className="mx-6 mt-4 rounded-md border border-dashed border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200"
    >
      Sprint&nbsp;0 demo flag active
      (NEXT_PUBLIC_SPRINT0_DEMO_BADGE_ENABLED=true)
    </div>
  );
}

export default async function AuthorHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  // ── Fetch author's books (needed for bookIds in subsequent queries) ──
  const { data: bookRows } = await supabase
    .from("books")
    .select("id, title, status, cover_image, updated_at")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(10);

  const books = bookRows ?? [];

  // The query above is capped at 10 for the displayed book list. Stat totals
  // must not inherit that cap, or an author with more than ten books gets
  // headline sales and comments covering only their ten most recent.
  const { data: allBookRows, error: allBooksError } = await supabase
    .from("books")
    .select("id, title")
    .eq("author_id", user.id);

  if (allBooksError) {
    console.error("[author/home] full catalogue load failed", {
      userId: user.id,
      message: allBooksError.message,
    });
  }

  // A failure here must not read as "this author has no books" — that would
  // render the empty-state dashboard to someone whose books just loaded fine
  // in the query above. Fall back to the ten already in hand.
  const catalogue = allBookRows ?? books;
  const bookIds = catalogue.map((b) => b.id as string);
  // Built from the full catalogue, not the ten displayed books: activity can
  // reference an older title, and it would otherwise render as "Untitled".
  const bookTitleById = new Map(
    catalogue.map((b) => [b.id as string, b.title as string | null] as const)
  );

  // ── Early return when author has no books ──
  if (bookIds.length === 0) {
    const { count: subCount } = await supabase
      .from("newsletter_subscriptions" as never)
      .select("id", { count: "exact", head: true })
      .eq("author_id", user.id)
      .eq("status", "active");

    const stats: DashboardStats = {
      sales: 0,
      readers: 0,
      subscribers: subCount ?? 0,
      comments: 0,
      reviews: 0,
    };

    return (
      <>
        <Sprint0DemoBadge />
        <HomeWorkspace stats={stats} books={[]} activity={[]} countrySales={[]} />
      </>
    );
  }

  // `readings`, `orders` and `comments` are keyed to the reader or buyer, so an
  // author session reads nothing from them. Ownership was already decided above
  // by the RLS-backed books query; every read below is scoped to `bookIds`.
  const admin = createAdminClient();

  // ── All remaining queries in parallel ──
  const [
    [readersRes, subscribersRes, reviewsRes, commentsRes],
    [translationsRes, audiobooksRes, publishesRes],
    readingsRes,
    countrySalesRes,
  ] = await Promise.all([
    // Stat counts (head-only queries)
    Promise.all([
      fetchAllRows<{ user_id: string | null }>((from, to) =>
        admin
          .from("readings")
          .select("user_id")
          .in("book_id", bookIds)
          .order("id", { ascending: true })
          .range(from, to)
      ),
      admin
        .from("newsletter_subscriptions" as never)
        .select("id", { count: "exact", head: true })
        .eq("author_id", user.id)
        .eq("status", "active"),
      admin
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .in("book_id", bookIds),
      // "Reader comments on your published books" — so not the author's own
      // replies in their own threads, which would let an active author inflate
      // their engagement number by answering readers.
      admin
        .from("comments")
        .select("id", { count: "exact", head: true })
        .in("book_id", bookIds)
        .neq("author_id", user.id),
    ]),
    // Activity events
    Promise.all([
      supabase
        .from("translations")
        .select("id, original_book_id, target_language, status, created_at")
        .in("original_book_id", bookIds)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("audiobook_assets")
        .select("id, book_id, language, status, created_at")
        .in("book_id", bookIds)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("book_versions")
        .select("id, book_id, published_at, language_code")
        .in("book_id", bookIds)
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(5),
    ]),
    // Per-book reader counts (single grouped query), paged for the same reason
    // as everything else here: max_rows = 1000 truncates without erroring.
    fetchAllRows<{ book_id: string }>((from, to) =>
      admin
        .from("readings")
        .select("book_id")
        .in("book_id", bookIds)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    // Paid orders drive both the revenue headline and the country breakdown,
    // so they are one read. `country` is nullable and must not filter it — an
    // order without a country is still revenue. Paged, because PostgREST caps
    // a plain select at max_rows = 1000 and would silently drop the rest.
    fetchAllRows<{
      amount: number | string | null;
      currency: string | null;
      country: string | null;
    }>((from, to) =>
      admin
        .from("orders")
        .select("amount, currency, country")
        .in("book_id", bookIds)
        .eq("status", SETTLED_PAYMENT_STATUS)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  // ── Assemble stats ──
  // sales and comments were hardcoded to 0 here. Not placeholders anyone chose —
  // the queries behind them simply did not exist, so every beta author saw a
  // dashboard reporting no sales however many books they had sold.
  const paidOrders = countrySalesRes.rows;
  if (countrySalesRes.error) {
    console.error("[author/home] orders load failed", {
      userId: user.id,
      message: countrySalesRes.error,
    });
  }

  // The card renders this as "<value> SEK" and calls it total revenue, so it is
  // an amount, not an order count. Amounts are minor units and each row carries
  // its own currency, hence the per-currency tally.
  const salesTotals: CurrencyTotals = new Map();
  for (const order of paidOrders) {
    addToCurrencyTotal(salesTotals, order.currency, Number(order.amount) || 0);
  }

  // readings is UNIQUE(user_id, book_id), so counting rows reports one reader
  // of three books as three readers. The card says "unique readers".
  const uniqueReaders = new Set(
    readersRes.rows.map((r) => r.user_id).filter((id): id is string => Boolean(id))
  );

  const salesHeadline = dominantCurrencyTotal(salesTotals);

  const stats: DashboardStats = {
    sales: salesHeadline.total,
    salesCurrency: salesHeadline.currency,
    readers: uniqueReaders.size,
    subscribers: subscribersRes.count ?? 0,
    comments: commentsRes.count ?? 0,
    reviews: reviewsRes.count ?? 0,
  };

  // ── Assemble books ──
  const readersByBook = new Map<string, number>();
  for (const r of readingsRes.rows) {
    readersByBook.set(r.book_id, (readersByBook.get(r.book_id) ?? 0) + 1);
  }

  const dashboardBooks: DashboardBook[] = books.map((book) => ({
    id: book.id,
    title: book.title,
    status: book.status,
    readers: readersByBook.get(book.id) ?? 0,
    updatedAt: book.updated_at,
    coverUrl: book.cover_image,
  }));

  // ── Assemble activity (merge translations, audiobooks, publishes) ──
  const activityItems: DashboardActivity[] = [];

  for (const t of translationsRes.data ?? []) {
    activityItems.push({
      id: `translation-${t.id}`,
      type: "translation",
      label:
        t.status === "done"
          ? "Translation completed"
          : `Translation ${t.status}`,
      detail: bookTitleById.get(t.original_book_id) ?? "Untitled",
      timestamp: t.created_at,
    });
  }

  for (const a of audiobooksRes.data ?? []) {
    activityItems.push({
      id: `audiobook-${a.id}`,
      type: "audiobook",
      label:
        a.status === "completed" ? "Audiobook ready" : `Audiobook ${a.status}`,
      detail: bookTitleById.get(a.book_id) ?? "Untitled",
      timestamp: a.created_at,
    });
  }

  const seenPublishBookIds = new Set<string>();
  for (const p of publishesRes.data ?? []) {
    if (!p.published_at) continue;
    if (seenPublishBookIds.has(p.book_id)) continue;
    seenPublishBookIds.add(p.book_id);
    activityItems.push({
      id: `publish-${p.id}`,
      type: "publish",
      label: "Published",
      detail: bookTitleById.get(p.book_id) ?? "Untitled",
      timestamp: p.published_at,
    });
  }

  activityItems.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const activity = activityItems.slice(0, 5);

  // ── Assemble country sales ──
  // The orders read no longer filters out a null country, because such an order
  // is still a sale and must reach `stats.sales`. It must not reach the country
  // breakdown though: as a map key it becomes a bogus "null" country, and in the
  // denominator it deflates every real country's share.
  const countryCounts = new Map<string, number>();
  let totalCountrySales = 0;
  for (const row of paidOrders) {
    const country = (row.country as string | null)?.trim();
    if (!country) continue;
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    totalCountrySales++;
  }
  const countrySales: CountrySale[] = [...countryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({
      country: code,
      share: `${Math.round((count / totalCountrySales) * 100)}%`,
    }));

  return (
    <>
      <Sprint0DemoBadge />
      <HomeWorkspace stats={stats} books={dashboardBooks} activity={activity} countrySales={countrySales} />
    </>
  );
}
