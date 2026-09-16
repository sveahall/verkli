export type LibraryBook = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  updatedAt: string | null;
  coverImageUrl: string | null;
  audiobookStatus: string | null;
  chapterCount: number;
  translationCount: number;
};

export type LibraryFilter = "ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type LibrarySort = "recent" | "title" | "chapters";

export function getBookHref(book: LibraryBook, demoModeActive = false): string {
  // Opening a book always returns to its manuscript. Optional formats are
  // selected from the book workspace; they are not publishing prerequisites.
  return `/author/books/${book.id}${demoModeActive ? "?panel=cover" : ""}`;
}

export function formatLibraryDate(value: string | null): string {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "DRAFT": return "Draft";
    case "PUBLISHED": return "Published";
    case "ARCHIVED": return "Archived";
    default: return "Unknown status";
  }
}

export function filterAndSortBooks(
  books: LibraryBook[],
  query: string,
  filter: LibraryFilter,
  sort: LibrarySort,
): LibraryBook[] {
  const search = query.trim().toLowerCase();
  return books
    .map((book, index) => ({ book, index }))
    .filter(({ book }) =>
      (filter === "ALL" || book.status === filter) &&
      (!search || book.title.toLowerCase().includes(search) ||
        (book.description ?? "").toLowerCase().includes(search))
    )
    .sort((a, b) => {
      if (sort === "title") {
        return a.book.title.localeCompare(b.book.title, "en") || a.index - b.index;
      }
      if (sort === "chapters") {
        return b.book.chapterCount - a.book.chapterCount || a.index - b.index;
      }

      const aTime = Date.parse(a.book.updatedAt ?? "");
      const bTime = Date.parse(b.book.updatedAt ?? "");
      const aValid = Number.isFinite(aTime);
      const bValid = Number.isFinite(bTime);
      if (aValid && bValid) return bTime - aTime || a.index - b.index;
      if (aValid !== bValid) return aValid ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ book }) => book);
}
