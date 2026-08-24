import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  /**
   * Set when a book the reader owns is no longer publicly listed. Their access
   * is unaffected — the note exists so the shelf explains itself instead of
   * looking broken.
   */
  unavailableNote?: string | null;
};

export type LibraryData = {
  reading: LibraryBook[];
  /**
   * Books the reader has paid for. Kept separate from `saved` (bookmarks):
   * merging the two made it impossible to tell what you own from what you
   * merely flagged, which left a buyer with no proof of purchase anywhere in
   * the product.
   */
  purchased: LibraryBook[];
  saved: LibraryBook[];
  finished: LibraryBook[];
  bookmarksCount: number;
};

type LibraryBookRow = {
  id: string;
  title: string;
  cover_image: string | null;
  author_id: string;
  status?: string | null;
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
    redirect("/reader/signin?next=/reader/library");
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
        .select("book_id, chapter_id, created_at")
        .eq("user_id", user.id)
        .eq("source", "purchase")
        .order("created_at", { ascending: false })
        .limit(LIBRARY_MAX_ENTITLEMENTS),
    ]);

  // One service-role client per render, created only if something actually
  // needs to see past the reader's own RLS.
  let adminClient: ReturnType<typeof createAdminClient> | null = null;
  const getAdmin = () => (adminClient ??= createAdminClient());

  const readings = readingsRows ?? [];
  const bookmarksCount = bookmarkRows?.length ?? 0;
  const readingFiltered = readings.filter((r) => (r.progress_percent ?? 0) < 100);
  const finishedFiltered = readings.filter((r) => (r.progress_percent ?? 0) >= 100);
  const readingBookIds = [...new Map(readingFiltered.map((r) => [r.book_id, r])).values()].map((r) => r.book_id);
  const finishedBookIds = [...new Map(finishedFiltered.map((r) => [r.book_id, r])).values()].map((r) => r.book_id);
  // "Saved" is bookmarks and nothing else. Purchases get their own shelf.
  const savedBookIds = [...new Set((bookmarkRows ?? []).map((r) => r.book_id))];

  const entitlements = (entitlementRows ?? []) as Array<{
    book_id: string;
    chapter_id: string | null;
    created_at: string | null;
  }>;
  const purchasedBookIds = [...new Set(entitlements.map((row) => row.book_id))];

  // Per-chapter purchases produce one entitlement row per chapter, and the shelf
  // dedupes to one card per book. Without keeping the chapter grain, an unlisted
  // book's card linked to the book's arbitrary FIRST chapter — which for a
  // per-chapter buyer is very often a chapter they did not buy, so the card led
  // straight to a locked reader. A null chapter_id is a whole-book purchase and
  // entitles every chapter.
  const wholeBookPurchases = new Set(
    entitlements.filter((row) => !row.chapter_id).map((row) => row.book_id)
  );
  const entitledChaptersByBookId = new Map<string, Set<string>>();
  for (const row of entitlements) {
    if (!row.chapter_id) continue;
    const set = entitledChaptersByBookId.get(row.book_id) ?? new Set<string>();
    set.add(row.chapter_id);
    entitledChaptersByBookId.set(row.book_id, set);
  }
  /** The chapter id only when this reader is actually entitled to it. */
  const entitledChapterOrNull = (bookId: string, chapterId: string | null | undefined) => {
    if (!chapterId) return null;
    if (wholeBookPurchases.has(bookId)) return chapterId;
    return entitledChaptersByBookId.get(bookId)?.has(chapterId) ? chapterId : null;
  };
  const purchasedAtByBookId = new Map(
    entitlements.map((row) => [row.book_id, row.created_at ?? null])
  );

  // Books reached through browsing stay subject to the normal publication
  // filter; purchases do not (see the admin read below).
  const browseBookIds = [...new Set([...readingBookIds, ...finishedBookIds, ...savedBookIds])]
    .filter((id) => !purchasedBookIds.includes(id));

  const bookMap = new Map<string, LibraryBookRow>();
  let authorNames: Record<string, string> = {};
  const chapterIds = [...new Set(readings.map((row) => row.chapter_id).filter(Boolean))];
  let chapterTitles = new Map<string, string>();

  const [{ data: browseBooks }, { data: chapterRows }, { data: purchasedBooks }] =
    await Promise.all([
      browseBookIds.length > 0
        ? supabase
            .from("books")
            .select("id, title, cover_image, author_id, status")
            .in("id", browseBookIds)
            .eq("status", "PUBLISHED")
        : Promise.resolve({ data: [] as LibraryBookRow[] }),
      chapterIds.length > 0
        ? supabase.from("chapters").select("id, title").in("id", chapterIds)
        : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
      // Entitlement — not publication status — governs the buyer's own library.
      // Read purchased books with the service-role client, scoped strictly to
      // the ids this user holds an entitlement for. Both the `status` filter and
      // the reader's RLS on `books` key off publication, so a book the author
      // later unpublished would otherwise silently disappear from the library of
      // the person who paid for it.
      purchasedBookIds.length > 0
        ? getAdmin()
            .from("books")
            .select("id, title, cover_image, author_id, status")
            .in("id", purchasedBookIds)
        : Promise.resolve({ data: [] as LibraryBookRow[] }),
    ]);

  for (const row of (browseBooks ?? []) as LibraryBookRow[]) {
    bookMap.set(row.id, row);
  }
  for (const row of (purchasedBooks ?? []) as LibraryBookRow[]) {
    bookMap.set(row.id, row);
  }

  chapterTitles = new Map((chapterRows ?? []).map((chapter) => [chapter.id, chapter.title]));

  const authorIds = [...new Set([...bookMap.values()].map((b) => b.author_id))];
  if (authorIds.length > 0) {
    // Service role: a purchased book's author profile must resolve even when
    // the book itself is no longer publicly visible.
    const { data: profiles } = await getAdmin()
      .from("profiles")
      .select("user_id, display_name, username")
      .in("user_id", authorIds);

    authorNames = Object.fromEntries(
      (profiles ?? []).map((p) => [p.user_id, p.display_name || p.username || "Author"])
    );
  }

  // A purchased book that is no longer published 404s on the public book page,
  // so the shelf links to the reading route instead. Resolve the first chapter
  // for those books in one batched query.
  const unlistedPurchasedIds = purchasedBookIds.filter((id) => {
    const book = bookMap.get(id);
    return Boolean(book) && book?.status !== "PUBLISHED";
  });
  const firstChapterByBookId = new Map<string, string>();
  if (unlistedPurchasedIds.length > 0) {
    const { data: firstChapters } = await getAdmin()
      .from("chapters")
      .select("id, book_id, order")
      .in("book_id", unlistedPurchasedIds)
      .order("order", { ascending: true });

    for (const chapter of (firstChapters ?? []) as Array<{ id: string; book_id: string }>) {
      if (!firstChapterByBookId.has(chapter.book_id)) {
        firstChapterByBookId.set(chapter.book_id, chapter.id);
      }
    }
  }

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

  const purchased: LibraryBook[] = purchasedBookIds
    .map((bookId): LibraryBook | null => {
      const book = bookMap.get(bookId);
      if (!book) return null;

      const isListed = book.status === "PUBLISHED";
      const readingMeta = readingRowByBookId.get(bookId);
      // Prefer where they left off, but only if they own it; then the first
      // chapter for a whole-book purchase; then any chapter they did buy.
      const resumeChapterId =
        entitledChapterOrNull(bookId, readingMeta?.chapterId) ??
        entitledChapterOrNull(bookId, firstChapterByBookId.get(bookId) ?? null) ??
        [...(entitledChaptersByBookId.get(bookId) ?? [])][0] ??
        null;
      const listedResumeChapterId = entitledChapterOrNull(bookId, readingMeta?.chapterId);
      const href = isListed
        ? listedResumeChapterId
          ? `/reader/read/${listedResumeChapterId}`
          : `/reader/books/${bookId}`
        : resumeChapterId
          ? `/reader/read/${resumeChapterId}`
          : undefined;

      const entry = toLibraryBook(bookId, readingMeta?.progress, href);
      if (!entry) return null;

      const purchasedAt = formatDateLabel(purchasedAtByBookId.get(bookId));
      return {
        ...entry,
        lastOpenedLabel: purchasedAt ? `Purchased ${purchasedAt}` : entry.lastOpenedLabel,
        unavailableNote: isListed
          ? null
          : "No longer listed by the author — your access is unaffected.",
      };
    })
    .filter((b): b is LibraryBook => b !== null);

  const data: LibraryData = {
    reading,
    purchased,
    saved,
    finished,
    bookmarksCount,
  };

  return <ReaderLibraryClient initialData={data} />;
}
