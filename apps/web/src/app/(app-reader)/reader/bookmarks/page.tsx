import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/reader/EmptyState";
import PageHeader from "@/components/reader/PageHeader";
import BookmarkRemoveButton from "./BookmarkRemoveButton";

export default async function ReaderBookmarksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/signin");
  }

  const { data: rows } = await supabase
    .from("bookmarks")
    .select("id, book_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const bookIds = (rows ?? []).map((r) => r.book_id);
  let books: { id: string; title: string; cover_image: string | null; author_id: string }[] = [];
  let authorNames: Record<string, string> = {};

  if (bookIds.length > 0) {
    const { data: booksData } = await supabase
      .from("books")
      .select("id, title, cover_image, author_id")
      .in("id", bookIds)
      .eq("status", "PUBLISHED");

    books = booksData ?? [];
    const authorIds = [...new Set(books.map((b) => b.author_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, username")
      .in("user_id", authorIds);

    authorNames = Object.fromEntries(
      (profiles ?? []).map((p) => [
        p.user_id,
        p.display_name || p.username || "Author",
      ])
    );
  }

  const bookById = Object.fromEntries(books.map((b) => [b.id, b]));
  const bookmarksWithBook = (rows ?? [])
    .map((r) => ({ ...r, book: bookById[r.book_id] }))
    .filter((r) => r.book);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Bookmarks"
        title="Saved moments"
        description="Keep the books you want to return to."
        actions={
          <Link
            href="/reader/library"
            className="inline-flex min-h-[40px] items-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
          >
            Back to library
          </Link>
        }
      />

      {bookmarksWithBook.length === 0 ? (
        <EmptyState
          title="Inga bokmärken än"
          description="Spara böcker från discover eller bibliotek så visas de här."
          action={
            <Link
              href="/reader/discover"
              className="inline-flex min-h-[40px] items-center rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
            >
              Utforska böcker
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4">
          {bookmarksWithBook.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
                  {item.book.title}
                </span>
                <span className="text-[12px] text-slate-400 dark:text-white/40">
                  {authorNames[item.book.author_id] ?? "Author"}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Link
                  href={`/reader/books/${item.book_id}`}
                  className="text-[12px] font-semibold text-slate-700 hover:text-slate-900 dark:text-white/70 dark:hover:text-white"
                >
                  Öppna bok
                </Link>
                <BookmarkRemoveButton bookId={item.book_id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
