/**
 * Client and server helper to group books by original + translations.
 * One "book group" = one original book + its translation records (same original_book_id).
 */

export type BookForGroup = {
  id: string;
  title: string;
  cover_image?: string | null;
  language?: string | null;
  is_translation?: boolean | null;
  original_book_id?: string | null;
  status?: string;
  [key: string]: unknown;
};

export type BookGroup = {
  groupId: string;
  title: string;
  cover: string | null;
  languages: Record<string, BookForGroup>;
  defaultBook: BookForGroup;
};

const ORIGINAL_LANG = "original";

/**
 * Build book groups from a flat list of books.
 * groupId = original_book_id when present, else book.id (so original is the "root").
 * defaultBook = the original in the group, or first book if original is missing.
 */
export function buildBookGroups(books: BookForGroup[]): BookGroup[] {
  const byGroupId = new Map<string, BookForGroup[]>();

  for (const book of books) {
    const groupId = book.original_book_id ?? book.id;
    const list = byGroupId.get(groupId) ?? [];
    list.push(book);
    byGroupId.set(groupId, list);
  }

  const groups: BookGroup[] = [];

  for (const [groupId, list] of byGroupId) {
    const original =
      list.find((b) => b.id === groupId) ??
      list.find((b) => !b.is_translation) ??
      list[0];
    const defaultBook = list.find((b) => b.id === groupId) ?? original;

    const languages: Record<string, BookForGroup> = {};
    languages[ORIGINAL_LANG] = original;
    for (const b of list) {
      if (b.is_translation && b.language) {
        const code = String(b.language).toLowerCase();
        languages[code] = b;
      }
    }

    const cover =
      original.cover_image ?? list.find((b) => b.cover_image)?.cover_image ?? null;
    const title = original.title || defaultBook.title || "Untitled";

    const group: BookGroup = {
      groupId,
      title,
      cover,
      languages,
      defaultBook,
    };
    groups.push(group);

    if (process.env.NODE_ENV === "development") {
      const langList = Object.keys(group.languages).filter((k) => k !== ORIGINAL_LANG);
      const codes = group.languages[ORIGINAL_LANG] ? ["original", ...langList] : langList;
      console.log("[book-groups] groupId:", groupId, "languages:", codes);
    }
  }

  return groups;
}

/**
 * Resolve group id from a route param that may be a book id (original or translation).
 * Caller should pass the book fetched by that id; returns the group id to use for the group.
 */
export function getGroupIdFromBook(book: BookForGroup): string {
  return book.original_book_id ?? book.id;
}

/**
 * Short language label for chips: "original", "sv", "en", or "2 languages" etc.
 */
export function getLanguageChipLabels(group: BookGroup): string[] {
  const hasOriginal = ORIGINAL_LANG in group.languages;
  const translated = Object.keys(group.languages).filter((k) => k !== ORIGINAL_LANG);
  const labels: string[] = [];
  if (hasOriginal) labels.push("original");
  translated.forEach((code) => labels.push(code));
  return labels;
}
