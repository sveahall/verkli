import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HomeWorkspace from "@/features/author-workspaces/home/HomeWorkspace";
import type {
  DashboardStats,
  DashboardBook,
  DashboardActivity,
} from "@/features/author-workspaces/home/types";

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
  const bookIds = books.map((b) => b.id);
  const bookTitleById = new Map(
    books.map((b) => [b.id, b.title] as const)
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

    return <HomeWorkspace stats={stats} books={[]} activity={[]} />;
  }

  // ── All remaining queries in parallel ──
  const [
    [readersRes, subscribersRes, reviewsRes],
    [translationsRes, audiobooksRes, publishesRes],
    readingsRes,
  ] = await Promise.all([
    // Stat counts (head-only queries)
    Promise.all([
      supabase
        .from("readings")
        .select("id", { count: "exact", head: true })
        .in("book_id", bookIds),
      supabase
        .from("newsletter_subscriptions" as never)
        .select("id", { count: "exact", head: true })
        .eq("author_id", user.id)
        .eq("status", "active"),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .in("book_id", bookIds),
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
    // Per-book reader counts (single grouped query)
    supabase
      .from("readings")
      .select("book_id")
      .in("book_id", bookIds),
  ]);

  // ── Assemble stats ──
  const stats: DashboardStats = {
    sales: 0,
    readers: readersRes.count ?? 0,
    subscribers: subscribersRes.count ?? 0,
    comments: 0,
    reviews: reviewsRes.count ?? 0,
  };

  // ── Assemble books ──
  const readersByBook = new Map<string, number>();
  for (const r of readingsRes.data ?? []) {
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

  for (const p of publishesRes.data ?? []) {
    if (!p.published_at) continue;
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

  return (
    <HomeWorkspace stats={stats} books={dashboardBooks} activity={activity} />
  );
}
