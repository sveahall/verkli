import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BookCard from "@/components/reader/BookCard";
import PageHeader from "@/components/reader/PageHeader";
import Rail from "@/components/reader/Rail";
import EmptyState from "@/components/reader/EmptyState";

export default async function ReaderProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("user_id", user.id)
    .maybeSingle();

  const displayName = String(profile?.display_name || profile?.username || "Reader");

  const { data: readingsRows } = await supabase
    .from("readings")
    .select("book_id, progress_percent, chapter_id, last_read_at")
    .eq("user_id", user.id)
    .order("last_read_at", { ascending: false })
    .limit(20);

  const readings = readingsRows ?? [];
  const booksStartedCount = new Set(readings.map((r) => r.book_id)).size;
  const booksFinishedCount = readings.filter((r) => (r.progress_percent ?? 0) >= 100).length;

  const bookIds = [...new Set(readings.map((r) => r.book_id))];
  let recentReads: { id: string; title: string; author: string; cover: string | null; progress: number }[] = [];

  if (bookIds.length > 0) {
    const { data: books } = await supabase
      .from("books")
      .select("id, title, cover_image, author_id")
      .in("id", bookIds)
      .eq("status", "PUBLISHED");

    if (books && books.length > 0) {
      const bookMap = new Map(books.map((b) => [b.id, b]));
      const authorIds = [...new Set(books.map((b) => b.author_id))];
      const { data: authorProfiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username")
        .in("user_id", authorIds);
      const authorMap = new Map(
        (authorProfiles ?? []).map((p) => [p.user_id, p.display_name || p.username || "Author"])
      );
      const progressByBook = new Map(readings.map((r) => [r.book_id, r.progress_percent ?? 0]));
      recentReads = readings
        .map((r) => {
          const book = bookMap.get(r.book_id);
          if (!book) return null;
          return {
            id: book.id,
            title: book.title,
            author: authorMap.get(book.author_id) ?? "Author",
            cover: book.cover_image,
            progress: progressByBook.get(book.id) ?? 0,
          };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);
      const seen = new Set<string>();
      recentReads = recentReads.filter((b) => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });
      recentReads = recentReads.slice(0, 8);
    }
  }

  const stats: { label: string; value: string }[] = [
    { label: "Books started", value: String(booksStartedCount) },
    { label: "Books finished", value: String(booksFinishedCount) },
  ];

  const initials = displayName
    .split(/\s+/)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Profile"
        title="Your reader space"
        subtitle="Track your reading rhythm, manage lists, and tailor your experience."
        actions={
          <Link
            href="/reader/library"
            className="inline-flex min-h-[40px] items-center rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          >
            My library
          </Link>
        }
      />

      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_16px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-[20px] font-semibold text-white dark:bg-white dark:text-slate-900">
              {initials}
            </div>
            <div>
              <p className="text-[18px] font-semibold text-slate-900 dark:text-white">{displayName}</p>
              <p className="text-[13px] text-slate-500 dark:text-white/60">Reader</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/reader/bookmarks"
              className="inline-flex min-h-[40px] items-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
            >
              Bookmarks
            </Link>
            <Link
              href="/reader/discover"
              className="inline-flex min-h-[40px] items-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
            >
              Discover
            </Link>
          </div>
        </div>

        {stats.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-4 text-left dark:border-white/10 dark:bg-white/5"
              >
                <p className="text-[12px] text-slate-500 dark:text-white/60">{stat.label}</p>
                <p className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <Rail
        title="Recently opened"
        subtitle="Jump back into your latest reads"
        isEmpty={recentReads.length === 0}
        emptyState={
          <EmptyState
            title="No reads yet"
            description="Start a book from Discover and it will appear here."
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
        {recentReads.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author}
            cover={book.cover}
            progress={book.progress}
            size="lg"
          />
        ))}
      </Rail>
    </div>
  );
}
