import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_NOT_AUTHENTICATED } from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  scoreSimilarBooks: vi.fn(),
  enrichWithAuthors: vi.fn(),
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

function makeAuthedSupabase() {
  const from = (table: string) => {
    if (table === "readings") {
      return {
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: [{ book_id: "seed-book" }], error: null }),
          }),
        }),
      };
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
            in: async () => ({ data: [], error: null }),
          }),
        }),
      };
    }

    if (table === "book_genres") {
      return {
        select: () => ({
          in: async (column: string) => {
            if (column === "book_id") {
              return {
                data: [{ book_id: "seed-book", genre_id: "genre-1" }],
                error: null,
              };
            }
            return { data: [], error: null };
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
    expect(mocks.scoreSimilarBooks).toHaveBeenCalledTimes(1);
    expect(mocks.enrichWithAuthors).toHaveBeenCalledTimes(1);
  });
});
