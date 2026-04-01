import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_BOOK_NOT_FOUND } from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

const { GET } = await import("./route");

function makeSupabaseMock(bookAuthorId: string) {
  const from = (table: string) => {
    if (table === "books") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "00000000-0000-4000-8000-000000000001",
                author_id: bookAuthorId,
              },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "book_versions") {
      const rows = [
        {
          id: "ver-1",
          language_code: "sv",
          status: "translating",
          created_at: "2026-02-11T11:00:00.000Z",
          updated_at: "2026-02-11T11:05:00.000Z",
        },
      ];

      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (resolve: (value: { data: typeof rows; error: null }) => unknown) =>
          Promise.resolve(resolve({ data: rows, error: null })),
      };

      return builder;
    }

    throw new Error(`Unexpected table: ${table}`);
  };

  return { from };
}

describe("GET /api/books/[id]/translation-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards auth failure response", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: null,
      response: new Response(JSON.stringify({ error: "NOT_AUTHENTICATED" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    });

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-status"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    });

    expect(res.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns 404 when book is not owned by author", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: { id: "author-1" },
      response: null,
    });
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-2"));

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-status"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe(E_BOOK_NOT_FOUND);
  });

  it("returns translation job status for owned book", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: { id: "author-1" },
      response: null,
    });
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"));

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-status"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      bookId: "00000000-0000-4000-8000-000000000001",
      status: "running",
      progress: 50,
      active: true,
    });
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]).toMatchObject({ id: "ver-1", language: "sv", status: "running" });
  });
});
