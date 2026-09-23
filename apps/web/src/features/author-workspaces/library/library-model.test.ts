import { describe, expect, it } from "vitest";
import {
  filterAndSortBooks,
  formatLibraryDate,
  getBookHref,
  getStatusLabel,
  type LibraryBook,
} from "./library-model";

function book(overrides: Partial<LibraryBook> = {}): LibraryBook {
  return {
    id: "book-1",
    title: "The last ferry",
    description: null,
    status: "DRAFT",
    updatedAt: null,
    coverImageUrl: null,
    audiobookStatus: null,
    chapterCount: 0,
    translationCount: 0,
    ...overrides,
  };
}

const routeCases: Array<{ label: string; value: LibraryBook }> = [
  { label: "empty manuscript", value: book() },
  { label: "missing cover", value: book({ chapterCount: 1 }) },
  { label: "missing audio", value: book({ chapterCount: 1, coverImageUrl: "/cover.jpg" }) },
  { label: "audio still processing", value: book({ chapterCount: 1, coverImageUrl: "/cover.jpg", audiobookStatus: "processing" }) },
  { label: "missing translation", value: book({ chapterCount: 1, coverImageUrl: "/cover.jpg", audiobookStatus: "ready" }) },
  { label: "completed audio", value: book({ chapterCount: 1, coverImageUrl: "/cover.jpg", audiobookStatus: "completed" }) },
  { label: "ready to publish", value: book({ chapterCount: 1, coverImageUrl: "/cover.jpg", audiobookStatus: "ready", translationCount: 1 }) },
  { label: "published complete", value: book({ chapterCount: 1, coverImageUrl: "/cover.jpg", audiobookStatus: "ready", translationCount: 1, status: "PUBLISHED" }) },
  { label: "published missing audio", value: book({ chapterCount: 1, coverImageUrl: "/cover.jpg", status: "PUBLISHED" }) },
  { label: "archived complete manuscript", value: book({ chapterCount: 1, coverImageUrl: "/cover.jpg", audiobookStatus: "completed", translationCount: 1, status: "ARCHIVED" }) },
];

describe("library workflow routes", () => {
  it.each(routeCases)("opens the manuscript without requiring optional formats for $label", ({ value }) => {
    expect(getBookHref(value)).toBe("/author/books/book-1");
  });

  it.each(routeCases)("always starts demo mode at cover for $label", ({ value }) => {
    expect(getBookHref(value, true)).toBe("/author/books/book-1?panel=cover");
  });

});

describe("library display metadata", () => {
  it.each([
    ["DRAFT", "Draft"],
    ["PUBLISHED", "Published"],
    ["ARCHIVED", "Archived"],
    ["IN_REVIEW", "Unknown status"],
    ["draft", "Unknown status"],
    ["", "Unknown status"],
  ])("labels %s truthfully", (status, label) => {
    expect(getStatusLabel(status)).toBe(label);
  });

  it.each([null, "", "not a date"])("handles unavailable date %s", (value) => {
    expect(formatLibraryDate(value)).toBe("Date unavailable");
  });

  it("formats a valid date using the existing English date style", () => {
    expect(formatLibraryDate("2026-09-02T12:00:00")).toBe("Sep 2, 2026");
  });
});

describe("library filtering and sorting", () => {
  const books = [
    book({ id: "a", title: "Zebra", description: "A midnight FERRY", updatedAt: null, chapterCount: 4 }),
    book({ id: "b", title: "Alpha", status: "PUBLISHED", updatedAt: "2026-09-02T12:00:00Z", chapterCount: 2 }),
    book({ id: "c", title: "Ferry home", status: "ARCHIVED", updatedAt: "2026-09-03T12:00:00Z", chapterCount: 1 }),
    book({ id: "d", title: "Beta", status: "IN_REVIEW", updatedAt: "invalid", chapterCount: 2 }),
    book({ id: "e", title: "Alpha", status: "DRAFT", updatedAt: "2026-09-02T12:00:00Z", chapterCount: 2 }),
  ];
  const ids = (values: LibraryBook[]) => values.map((value) => value.id);

  it("searches title and nullable description case-insensitively after trimming", () => {
    expect(ids(filterAndSortBooks(books, "  FeRrY  ", "ALL", "title"))).toEqual(["c", "a"]);
  });

  it("combines search with the exact real status filter", () => {
    expect(ids(filterAndSortBooks(books, "ferry", "DRAFT", "title"))).toEqual(["a"]);
    expect(ids(filterAndSortBooks(books, "", "PUBLISHED", "title"))).toEqual(["b"]);
    expect(ids(filterAndSortBooks(books, "", "ARCHIVED", "title"))).toEqual(["c"]);
  });

  it("includes unknown statuses only in All and supports empty results", () => {
    expect(ids(filterAndSortBooks(books, "", "ALL", "title"))).toContain("d");
    expect(ids(filterAndSortBooks(books, "", "DRAFT", "title"))).toEqual(["e", "a"]);
    expect(filterAndSortBooks(books, "unmatched", "ALL", "recent")).toEqual([]);
    expect(filterAndSortBooks([], "", "ALL", "recent")).toEqual([]);
  });

  it("treats an empty or whitespace query as all matching books", () => {
    expect(ids(filterAndSortBooks(books, " \n ", "ALL", "recent")))
      .toEqual(ids(filterAndSortBooks(books, "", "ALL", "recent")));
    expect(filterAndSortBooks(books, "", "ALL", "recent")).toHaveLength(5);
  });

  it("sorts recent first, placing missing or invalid dates last with stable ties", () => {
    expect(ids(filterAndSortBooks(books, "", "ALL", "recent"))).toEqual(["c", "b", "e", "a", "d"]);
  });

  it("sorts titles in English order with stable equal-title ties", () => {
    expect(ids(filterAndSortBooks(books, "", "ALL", "title"))).toEqual(["b", "e", "d", "c", "a"]);
  });

  it("sorts chapter counts descending with stable equal-count ties", () => {
    expect(ids(filterAndSortBooks(books, "", "ALL", "chapters"))).toEqual(["a", "b", "d", "e", "c"]);
  });

  it("does not mutate the input array or book records and always returns a new array", () => {
    const values = books.map((value) => Object.freeze({ ...value }));
    const before = values.map((value) => ({ ...value }));
    Object.freeze(values);
    const result = filterAndSortBooks(values, "", "ALL", "recent");
    expect(result).not.toBe(values);
    expect(values).toEqual(before);
    expect(result.find((value) => value.id === "a")).toBe(values[0]);
  });
});
