import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_NOT_AUTHENTICATED } from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  scoreSimilarBooks: vi.fn(),
  enrichWithAuthors: vi.fn(),
  historyOrder: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/recommendations/scoring", () => ({
  scoreSimilarBooks: mocks.scoreSimilarBooks,
}));

vi.mock("@/lib/recommendations/enrichment", () => ({
  enrichWithAuthors: mocks.enrichWithAuthors,
}));

const { GET } = await import("./route");

function makeAuthedSupabase(noHistory = false, readingsError = false) {
  const from = (table: string) => {
    if (table === "readings") {
      const query = {
        select: () => query,
        eq: () => query,
        order: mocks.historyOrder.mockImplementation(() => query),
        limit: async () => ({ data: noHistory ? [] : [{ book_id: "seed-book" }], error: readingsError ? { message: "database unavailable" } : null }),
      };
      return query;
    }

    if (table === "reader_genre_preferences") {
      return {
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: [{ genre_id: "genre-1" }], error: null }),
          }),
        }),
      };
    }

    if (table === "books") {
      return {
        select: () => ({
          in: async () => ({
            data: [{ id: "seed-book", author_id: "author-1", language: "en" }],
            error: null,
          }),
          eq: () => ({
            in: async () => ({ data: [{ id: "seed-book", author_id: "author-1", language: "en" }], error: null }),
          }),
        }),
      };
    }

    if (table === "book_genres") {
      return {
        select: () => ({
          in: (column: string) => {
            if (column === "book_id") {
              return {
                data: [{ book_id: "seed-book", genre_id: "genre-1" }],
                error: null,
              };
            }
            return { limit: async () => ({ data: [{ book_id: "seed-book" }], error: null }) };
          },
          limit: async () => ({ data: [], error: null }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  };

  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: "reader-1" } },
      }),
    },
    from,
  };
}

describe("GET /api/recommendations/for-you", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.createClient.mockResolvedValueOnce({
      auth: {
        getUser: async () => ({ data: { user: null } }),
      },
      from: vi.fn(),
    });

    const res = await GET(new Request("http://localhost/api/recommendations/for-you"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe(E_NOT_AUTHENTICATED);
  });

  it("returns ranked and enriched recommendations", async () => {
    mocks.createClient.mockResolvedValueOnce(makeAuthedSupabase());
    mocks.scoreSimilarBooks.mockResolvedValueOnce([
      {
        id: "book-2",
        title: "Recommended Book",
        cover_image: null,
        author_id: "author-2",
        score: 15,
      },
    ]);
    mocks.enrichWithAuthors.mockResolvedValueOnce([
      {
        id: "book-2",
        title: "Recommended Book",
        cover_image: null,
        author_id: "author-2",
        score: 15,
        author_name: "Author Two",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/recommendations/for-you?limit=10"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.books).toEqual([
      expect.objectContaining({ id: "book-2", author_name: "Author Two", score: 15 }),
    ]);
    expect(mocks.historyOrder).toHaveBeenCalledWith("last_read_at", { ascending: false });
    expect(mocks.scoreSimilarBooks).toHaveBeenCalledTimes(1);
    expect(mocks.enrichWithAuthors).toHaveBeenCalledTimes(1);
  });
});

describe("recommendation signal boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scoreSimilarBooks.mockResolvedValue([]);
    mocks.enrichWithAuthors.mockResolvedValue([]);
  });

  it("scores genre-only readers without inventing an author or read history", async () => {
    mocks.createClient.mockResolvedValueOnce(makeAuthedSupabase(true));
    const response = await GET(new Request("http://localhost/api/recommendations/for-you"));
    expect(response.status).toBe(200);
    expect(mocks.scoreSimilarBooks).toHaveBeenCalledWith(expect.anything(), null, null, null, ["genre-1"], 50);
  });

  it("returns a retryable error when reading history cannot be loaded", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createClient.mockResolvedValueOnce(makeAuthedSupabase(false, true));
    const response = await GET(new Request("http://localhost/api/recommendations/for-you"));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "RECOMMENDATIONS_LOAD_FAILED" });
    expect(mocks.scoreSimilarBooks).not.toHaveBeenCalled();
    log.mockRestore();
  });
});


type HistoryRow = { book_id: string; last_read_at: string };
function orderedSignals(history: HistoryRow[], bookOrder = history.map((row) => row.book_id)) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "reader-1" } } }) },
    from(table: string) {
      let rows: Record<string, unknown>[] = table === "readings" ? history.map((row) => ({ ...row, user_id: "reader-1" }))
        : table === "books" ? bookOrder.map((id) => ({ id, author_id: `author-${id}`, language: "en" })) : [];
      const orders: Array<{ key: string; ascending: boolean }> = [];
      const query = {
        select: () => query,
        eq: (key: string, value: string) => { rows = rows.filter((row) => row[key] === value); return query; },
        in: (key: string, values: string[]) => { rows = rows.filter((row) => values.includes(String(row[key]))); return query; },
        order: (key: string, options: { ascending: boolean }) => { orders.push({ key, ...options }); return query; },
        limit: (count: number) => {
          rows.sort((a, b) => {
            for (const { key, ascending } of orders) {
              const result = String(a[key]).localeCompare(String(b[key]));
              if (result) return ascending ? result : -result;
            }
            return 0;
          });
          rows = rows.slice(0, count); return query;
        },
        then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
      };
      return query;
    },
  };
}

describe("stable recommendation seed and result ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scoreSimilarBooks.mockResolvedValue([]);
    mocks.enrichWithAuthors.mockImplementation(async (_client, books) => books);
  });

  it("selects the same five seeds for tied reading timestamps despite database row order", async () => {
    const history = Array.from({ length: 6 }, (_, i) => ({ book_id: `seed-${i + 1}`, last_read_at: "2026-09-22T10:00:00Z" }));
    for (const rows of [[...history].reverse(), history]) {
      mocks.scoreSimilarBooks.mockClear();
      mocks.createClient.mockResolvedValueOnce(orderedSignals(rows));
      await GET(new Request("http://localhost/api/recommendations/for-you"));
      expect(mocks.scoreSimilarBooks.mock.calls.map((call) => call[1]).sort()).toEqual(["seed-1", "seed-2", "seed-3", "seed-4", "seed-5"]);
    }
  });

  it("preserves recent-first seed order when an IN query returns books in another order", async () => {
    mocks.createClient.mockResolvedValueOnce(orderedSignals([
      { book_id: "recent-z", last_read_at: "2026-09-22T10:00:00Z" },
      { book_id: "older-a", last_read_at: "2026-09-21T10:00:00Z" },
    ], ["older-a", "recent-z"]));
    await GET(new Request("http://localhost/api/recommendations/for-you"));
    expect(mocks.scoreSimilarBooks.mock.calls.map((call) => call[1])).toEqual(["recent-z", "older-a"]);
  });

  it("keeps equal-score results stable before applying the requested result limit", async () => {
    const candidate = (id: string) => ({ id, title: id, author_id: "author", cover_image: null, score: 13 });
    for (const batch of [[candidate("z-book"), candidate("a-book")], [candidate("a-book"), candidate("z-book")]]) {
      mocks.createClient.mockResolvedValueOnce(orderedSignals([{ book_id: "seed", last_read_at: "2026-09-22T10:00:00Z" }]));
      mocks.scoreSimilarBooks.mockResolvedValueOnce(batch);
      const response = await GET(new Request("http://localhost/api/recommendations/for-you?limit=1"));
      expect((await response.json()).books.map((book: { id: string }) => book.id)).toEqual(["a-book"]);
    }
  });
});
