import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReaderLibraryClient from "./ReaderLibraryClient";

export type LibraryBook = {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  progress?: number;
  href?: string;
};

export type LibraryData = {
  reading: LibraryBook[];
  saved: LibraryBook[];
  finished: LibraryBook[];
  bookmarksCount: number;
};

export default async function ReaderLibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/signin");
  }

  const { data: readingsRows } = await supabase
    .from("readings")
    .select("book_id, chapter_id, progress_percent, last_read_at")
    .eq("user_id", user.id)
    .order("last_read_at", { ascending: false });

  const { data: bookmarkRows } = await supabase
    .from("bookmarks")
    .select("book_id")
    .eq("user_id", user.id);

  const { data: entitlementRows } = await supabase
    .from("entitlements" as never)
    .select("book_id")
    .eq("user_id", user.id)
    .eq("source", "purchase");

  const readings = readingsRows ?? [];
  const bookmarksCount = bookmarkRows?.length ?? 0;
  const readingFiltered = readings.filter((r) => (r.progress_percent ?? 0) < 100);
  const finishedFiltered = readings.filter((r) => (r.progress_percent ?? 0) >= 100);
  const readingBookIds = [...new Map(readingFiltered.map((r) => [r.book_id, r])).values()].map((r) => r.book_id);
  const finishedBookIds = [...new Map(finishedFiltered.map((r) => [r.book_id, r])).values()].map((r) => r.book_id);
  const bookmarkedBookIds = (bookmarkRows ?? []).map((r) => r.book_id);
  const purchasedBookIds = (entitlementRows ?? []).map((r) => (r as { book_id: string }).book_id);
  const savedBookIds = [...new Set([...bookmarkedBookIds, ...purchasedBookIds])];

  const allBookIds = [...new Set([...readingBookIds, ...finishedBookIds, ...savedBookIds])];
  let books: { id: string; title: string; cover_image: string | null; author_id: string }[] = [];
  let authorNames: Record<string, string> = {};

  if (allBookIds.length > 0) {
    const { data: booksData } = await supabase
      .from("books")
      .select("id, title, cover_image, author_id")
      .in("id", allBookIds)
      .eq("status", "PUBLISHED");
    books = booksData ?? [];
    const authorIds = [...new Set(books.map((b) => b.author_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, username")
      .in("user_id", authorIds);
    authorNames = Object.fromEntries(
      (profiles ?? []).map((p) => [p.user_id, p.display_name || p.username || "Author"])
    );
  }

  const bookMap = new Map(books.map((b) => [b.id, b]));
  const toLibraryBook = (
    bookId: string,
    progress?: number,
    href?: string
  ): LibraryBook | null => {
    const book = bookMap.get(bookId);
    if (!book) return null;
    return {
      id: book.id,
      title: book.title,
      author: authorNames[book.author_id] ?? "Author",
      cover: book.cover_image,
      progress,
      href,
    };
  };

  const readingMap = new Map(
    readings
      .filter((r) => (r.progress_percent ?? 0) < 100)
      .map((r) => [
        r.book_id,
        {
          progress: r.progress_percent ?? 0,
          chapterId: r.chapter_id,
        },
      ])
  );
  const reading: LibraryBook[] = [];
  for (const bookId of readingBookIds) {
    const meta = readingMap.get(bookId);
    const book = bookMap.get(bookId);
    const href = book && meta?.chapterId
      ? `/reader/read/${meta.chapterId}`
      : book
        ? `/reader/books/${bookId}`
        : undefined;
    const b = toLibraryBook(bookId, meta?.progress, href);
    if (b) reading.push(b);
  }

  const finishedMap = new Map(
    readings
      .filter((r) => (r.progress_percent ?? 0) >= 100)
      .map((r) => [r.book_id, r.progress_percent ?? 100])
  );
  const finished: LibraryBook[] = finishedBookIds
    .map((bookId) => toLibraryBook(bookId, finishedMap.get(bookId) ?? 100, `/reader/books/${bookId}`))
    .filter((b): b is LibraryBook => b !== null);

  const saved: LibraryBook[] = savedBookIds
    .map((bookId) => toLibraryBook(bookId, undefined, `/reader/books/${bookId}`))
    .filter((b): b is LibraryBook => b !== null);

  const data: LibraryData = {
    reading,
    saved,
    finished,
    bookmarksCount,
  };

  return <ReaderLibraryClient initialData={data} />;
}
