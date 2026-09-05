import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReaderHomePageView from "@/features/reader/reader-home/ReaderHomePageView";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getPublicAuthorInfoMap: vi.fn(),
  redirect: vi.fn(() => { throw new Error("Unexpected redirect"); }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("@/lib/flags", () => ({
  getRecommendationsEnabled: () => false,
  getDiscoverHref: () => "/reader/discover",
}));
vi.mock("@/lib/authors/public-author", () => ({
  getPublicAuthorInfoMap: mocks.getPublicAuthorInfoMap,
  resolvePublicAuthorName: (info?: { name: string }) => info?.name ?? "Author",
}));
vi.mock("@/components/ui/ErrorBanner", () => ({ ErrorBannerWrapper: () => null }));

const { default: ReaderHomePage } = await import("./page");
const readerId = "synthetic-reader";
const readings = [
  { book_id: "older-book", chapter_id: null, progress_percent: 12, last_read_at: "2026-09-02T12:00:00Z" },
  { book_id: "newer-book", chapter_id: "chapter-2", progress_percent: 42, last_read_at: "2026-09-04T12:00:00Z" },
];
const books = [
  { id: "older-book", title: "Older Synthetic Book", author_id: "author-1", cover_image: null, status: "PUBLISHED" },
  { id: "newer-book", title: "Newer Synthetic Book", author_id: "author-1", cover_image: null, status: "PUBLISHED" },
];
const chapters = [{ id: "chapter-2", title: "Synthetic Chapter Two" }];
type Query = {
  table: string;
  select?: string;
  options?: { count: string; head: boolean };
  filters: [string, string, unknown][];
  orders: [string, { ascending: boolean }][];
  limit?: number;
};
type Fixture = {
  readings?: typeof readings;
  books?: typeof books;
  chapters?: typeof chapters;
  readingError?: { code: string; message: string };
};

// Return-value transport only: validate the actual query contract, then select
// synthetic rows. Schema errors reproduce PostgREST's returned-error behavior.
function makeClient(fixture: Fixture) {
  const calls: Query[] = [];
  const violations: string[] = [];
  const rows = [...(fixture.readings ?? readings)]
    .sort((left, right) => right.last_read_at.localeCompare(left.last_read_at)).slice(0, 8);
  const bookIds = rows.map((row) => row.book_id);
  const chapterIds = [...new Set(rows.map((row) => row.chapter_id).filter(Boolean))];
  const visibleBooks = (fixture.books ?? books).filter((book) => book.status === "PUBLISHED" && bookIds.includes(book.id));
  const check = (actual: unknown, expected: unknown, label: string) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) violations.push(label);
  };
  const from = (table: string) => {
    const query: Query = { table, filters: [], orders: [] };
    calls.push(query);
    const result = () => {
      if (table === "profiles") {
        check(query.select, "onboarding_completed_at, display_name, username", "profile projection");
        check(query.filters, [["eq", "user_id", readerId]], "profile scope");
        return { data: { display_name: "Synthetic Reader", onboarding_completed_at: "2026-09-01" }, error: null };
      }
      if (query.select === "*" && ["readings", "bookmarks"].includes(table)) {
        check(query.options, { count: "exact", head: true }, "count projection");
        const comparison = table === "readings" ? [query.filters[1]] : [];
        if (table === "readings" && !["lt", "gte"].includes(query.filters[1]?.[0])) violations.push("reading count comparison");
        check(query.filters, [["eq", "user_id", readerId], ...comparison], "count scope");
        if (table === "readings") check(query.filters[1]?.slice(1), ["progress_percent", 99], "count threshold");
        return { data: null, error: null, count: 0 };
      }
      if (table === "readings") {
        check(query.filters, [["eq", "user_id", readerId]], "continue reading scope");
        check(query.limit, 8, "continue reading limit");
        const columns = ["book_id", "progress_percent", "last_read_at", "chapter_id"];
        if (query.select?.split(", ").some((column) => !columns.includes(column)) || query.orders.some(([column]) => !columns.includes(column))) {
          return { data: null, error: { code: "42703", message: "Unknown readings column" } };
        }
        check(query.select, columns.join(", "), "continue reading projection");
        check(query.orders, [["last_read_at", { ascending: false }]], "continue reading order");
        return { data: fixture.readingError ? null : rows, error: fixture.readingError ?? null };
      }
      if (table === "books" && query.limit === 72) {
        check(query.select, "id, title, cover_image, author_id, published_at, updated_at", "book pool projection");
        check(query.filters, [["eq", "status", "PUBLISHED"]], "book pool status");
        check(query.orders, [["published_at", { ascending: false }], ["updated_at", { ascending: false }]], "book pool order");
        return { data: [], error: null };
      }
      if (table === "books") {
        check(query.select, "id, title, cover_image, author_id", "reading book projection");
        check(query.filters, [["eq", "status", "PUBLISHED"], ["in", "id", bookIds]], "reading book IDs/status");
        return { data: visibleBooks, error: null };
      }
      if (table === "chapters") {
        check(query.select, "id, title", "chapter projection");
        check(query.filters, [["in", "id", chapterIds]], "chapter IDs");
        return { data: (fixture.chapters ?? chapters).filter((chapter) => chapterIds.includes(chapter.id)), error: null };
      }
      violations.push(`Unexpected table ${table}`);
      return { data: null, error: { code: "UNEXPECTED", message: "Unexpected query" } };
    };
    const chain = {
      select(value: string, options?: Query["options"]) { query.select = value; query.options = options; return chain; },
      eq(column: string, value: unknown) { query.filters.push(["eq", column, value]); return chain; },
      in(column: string, value: unknown) { query.filters.push(["in", column, value]); return chain; },
      lt(column: string, value: unknown) { query.filters.push(["lt", column, value]); return chain; },
      gte(column: string, value: unknown) { query.filters.push(["gte", column, value]); return chain; },
      order(column: string, options: { ascending: boolean }) { query.orders.push([column, options]); return chain; },
      limit(value: number) { query.limit = value; return chain; },
      maybeSingle() { return Promise.resolve(result()); },
      then(resolve: (value: ReturnType<typeof result>) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve(result()).then(resolve, reject);
      },
    };
    return chain;
  };
  return { calls, violations, client: { from, auth: { getUser: async () => ({ data: { user: { id: readerId } } }) } } };
}

type ViewElement = ReactElement<ComponentProps<typeof ReaderHomePageView>>;
function findView(node: ReactNode): ViewElement | null {
  if (Array.isArray(node)) {
    for (const child of node) { const found = findView(child); if (found) return found; }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (node.type === ReaderHomePageView) return node as ViewElement;
  return findView(node.props.children);
}

async function renderHome(fixture: Fixture = {}) {
  const io = makeClient(fixture);
  mocks.createClient.mockResolvedValue(io.client);
  const tree = await ReaderHomePage();
  const view = findView(tree);
  expect(view).not.toBeNull();
  const html = renderToStaticMarkup(tree);
  // Check outside Page's catches so a bad test query cannot be swallowed.
  expect(io.violations).toEqual([]);
  expect(mocks.redirect).not.toHaveBeenCalled();
  return { html, props: view!.props, calls: io.calls };
}

describe("ReaderHomePage continue reading timestamp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
    mocks.getPublicAuthorInfoMap.mockImplementation(async (ids: string[]) => {
      expect(ids).toEqual(["author-1"]);
      return new Map([["author-1", { name: "Synthetic Author" }]]);
    });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("renders published reading cards newest-first with progress and resume/fallback links", async () => {
    const { html, props, calls } = await renderHome();
    expect(html).toContain("Continue Reading");
    expect(props.continueReading.map((book) => book.id)).toEqual(["newer-book", "older-book"]);
    expect(html.indexOf("Newer Synthetic Book")).toBeLessThan(html.indexOf("Older Synthetic Book"));
    expect(html).toContain('href="/reader/read/chapter-2"');
    expect(html).toContain('href="/reader/books/older-book"');
    expect(html).toContain("42%");
    expect(html).toContain("12%");
    expect(html).toContain("Synthetic Chapter Two");
    expect(props.continueReading.map((book) => book.progress)).toEqual([42, 12]);
    expect(props.continueReading.map((book) => book.lastOpenedLabel)).toEqual(
      [readings[1], readings[0]].map((row) => `Last opened ${new Date(row.last_read_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`)
    );
    expect(html).not.toContain("Last opened"); // Current view receives but does not render this label.
    expect(calls.find((call) => call.table === "readings" && call.limit === 8)?.select).toBe("book_id, progress_percent, last_read_at, chapter_id");
    expect(mocks.getPublicAuthorInfoMap).toHaveBeenCalledWith(["author-1"]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("keeps the existing browse fallback for a legitimate empty history", async () => {
    const { html, props, calls } = await renderHome({ readings: [] });
    expect(props.continueReading).toEqual([]);
    expect(html).not.toContain("Continue Reading");
    expect(html).toContain("Discover books");
    expect(html).toContain('href="/reader/discover"');
    expect(html).not.toContain("Synthetic Book");
    expect(calls.some((call) => call.table === "chapters")).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  for (const unavailable of ["missing", "unpublished"]) {
    it(`does not hide a valid published book when another reading's book is ${unavailable}`, async () => {
      const fixtureBooks = unavailable === "missing" ? [books[1]] : books.map((book) => ({ ...book, status: book.id === "older-book" ? "DRAFT" : book.status }));
      const { html, props } = await renderHome({ books: fixtureBooks });
      expect(props.continueReading.map((book) => book.id)).toEqual(["newer-book"]);
      expect(html).toContain("Newer Synthetic Book");
      expect(html).not.toContain("Older Synthetic Book");
      expect(html).toContain("42%");
    });
  }

  it("uses the existing author-label fallback when the saved chapter cannot be resolved", async () => {
    const { html, props } = await renderHome({ chapters: [] });
    expect(props.continueReading[0]).toMatchObject({ chapterLabel: null, href: "/reader/read/chapter-2" });
    expect(html).toContain("Continue Reading");
    expect(html).toContain("Synthetic Author");
    expect(html).not.toContain("Synthetic Chapter Two");
    expect(html).toContain('href="/reader/books/older-book"');
  });

  it("keeps the noncritical fallback and logs only the operation/code on a returned query error", async () => {
    const { html, props } = await renderHome({ readingError: { code: "42501", message: "Synthetic private details must not be logged" } });
    expect(props.continueReading).toEqual([]);
    expect(html).toContain("Discover books");
    expect(html).not.toContain("Continue Reading");
    expect(console.error).toHaveBeenCalledExactlyOnceWith("[reader/home] continue-reading load failed", { code: "42501" });
  });
});
