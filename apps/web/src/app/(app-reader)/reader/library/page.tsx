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
  chapterLabel?: string | null;
  lastOpenedLabel?: string | null;
};

export type LibraryData = {
  reading: LibraryBook[];
  saved: LibraryBook[];
  finished: LibraryBook[];
  bookmarksCount: number;
};

function formatDateLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function ReaderLibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/signin");
  }

  // Hard caps so a power user's reading history doesn't ship thousands of
  // rows to every /reader/library render. The library page only shows the
  // most recent items anyway — the previous unbounded scan regressed badly
  // once someone had a few hundred opened books.
  const LIBRARY_MAX_READINGS = 200;
  const LIBRARY_MAX_BOOKMARKS = 200;
  const LIBRARY_MAX_ENTITLEMENTS = 200;

  const [{ data: readingsRows }, { data: bookmarkRows }, { data: entitlementRows }] =
    await Promise.all([
      supabase
        .from("readings")
        .select("book_id, chapter_id, progress_percent, last_read_at")
        .eq("user_id", user.id)
        .order("last_read_at", { ascending: false })
        .limit(LIBRARY_MAX_READINGS),
      supabase
        .from("bookmarks")
        .select("book_id")
        .eq("user_id", user.id)
        .limit(LIBRARY_MAX_BOOKMARKS),
      supabase
        .from("entitlements" as never)
        .select("book_id")
        .eq("user_id", user.id)
        .eq("source", "purchase")
        .limit(LIBRARY_MAX_ENTITLEMENTS),
    ]);

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
  const chapterIds = [...new Set(readings.map((row) => row.chapter_id).filter(Boolean))];
  let chapterTitles = new Map<string, string>();

  if (allBookIds.length > 0) {
    const [{ data: booksData }, { data: chapterRows }] = await Promise.all([
      supabase
        .from("books")
        .select("id, title, cover_image, author_id")
        .in("id", allBookIds)
        .eq("status", "PUBLISHED"),
      chapterIds.length > 0
        ? supabase.from("chapters").select("id, title").in("id", chapterIds)
        : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    ]);

    books = booksData ?? [];
    chapterTitles = new Map((chapterRows ?? []).map((chapter) => [chapter.id, chapter.title]));

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
  const readingRowByBookId = new Map(
    readings.map((row) => [
      row.book_id,
      {
        chapterId: row.chapter_id,
        progress: row.progress_percent ?? 0,
        lastOpenedLabel: formatDateLabel(row.last_read_at)
          ? `Last opened ${formatDateLabel(row.last_read_at)}`
          : null,
      },
    ])
  );

  const toLibraryBook = (
    bookId: string,
    progress?: number,
    href?: string
  ): LibraryBook | null => {
    const book = bookMap.get(bookId);
    if (!book) return null;
    const readingMeta = readingRowByBookId.get(bookId);
    return {
      id: book.id,
      title: book.title,
      author: authorNames[book.author_id] ?? "Author",
      cover: book.cover_image,
      progress,
      href,
      chapterLabel: readingMeta?.chapterId ? chapterTitles.get(readingMeta.chapterId) ?? null : null,
      lastOpenedLabel: readingMeta?.lastOpenedLabel ?? null,
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
