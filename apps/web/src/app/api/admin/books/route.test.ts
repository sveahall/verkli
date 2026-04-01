import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_DATABASE_ERROR, E_INVALID_BOOK_ID } from "@/lib/api-errors";

/* ── hoisted mocks ─────────────────────────────────────────────────────────── */

const mocks = vi.hoisted(() => ({
  requireAdminRoleForApi: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdminRoleForApi: mocks.requireAdminRoleForApi,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

// Force in-memory rate limiter (no Redis)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

const { GET, DELETE } = await import("./route");

/* ── helpers ───────────────────────────────────────────────────────────────── */

const VALID_UUID = "00000000-0000-4000-8000-000000000001";

function makeGetRequest(params?: Record<string, string>) {
  const url = new URL("http://localhost/api/admin/books");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" });
}

function makeDeleteRequest(body?: unknown) {
  return new Request("http://localhost/api/admin/books", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function adminAllowed() {
  mocks.requireAdminRoleForApi.mockResolvedValue({
    user: { id: "admin-1" },
    response: null,
  });
}

function adminDenied(status: 401 | 403) {
  const resp = new Response(JSON.stringify({ error: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" }), { status });
  mocks.requireAdminRoleForApi.mockResolvedValue({
    user: null,
    response: resp,
  });
}

/* ── GET tests ─────────────────────────────────────────────────────────────── */

describe("GET /api/admin/books", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 without authenticated user", async () => {
    adminDenied(401);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    adminDenied(403);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it("returns books list on success", async () => {
    adminAllowed();

    const books = [
      { id: VALID_UUID, title: "Book A", slug: "book-a", status: "published", author_id: "a1", created_at: "2026-01-01", updated_at: "2026-01-02", language: "en" },
    ];

    const rangeFn = vi.fn().mockResolvedValue({ data: books, error: null, count: 1 });
    const orderFn = vi.fn(() => ({ range: rangeFn }));
    const selectFn = vi.fn(() => ({ order: orderFn }));

    const profilesInFn = vi.fn().mockResolvedValue({ data: [{ user_id: "a1", display_name: "Author A" }], error: null });
    const profilesSelectFn = vi.fn(() => ({ in: profilesInFn }));

    const from = vi.fn((table: string) => {
      if (table === "books") return { select: selectFn };
      if (table === "profiles") return { select: profilesSelectFn };
      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.createAdminClient.mockReturnValue({ from });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.books).toHaveLength(1);
    expect(body.books[0].title).toBe("Book A");
    expect(body.books[0].author_name).toBe("Author A");
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
  });

  it("returns 500 when database query fails", async () => {
    adminAllowed();

    const rangeFn = vi.fn().mockResolvedValue({ data: null, error: { message: "db down" }, count: null });
    const orderFn = vi.fn(() => ({ range: rangeFn }));
    const selectFn = vi.fn(() => ({ order: orderFn }));

    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({ select: selectFn })),
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(E_DATABASE_ERROR);
  });

  it("passes search query via ilike filter", async () => {
    adminAllowed();

    // The route builds: .select().order().range() -> query, then query.ilike()
    // So range() must return an object with .ilike() and be thenable.
    const ilikeFn = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });
    const rangeFn = vi.fn(() => ({
      ilike: ilikeFn,
      then: (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
    }));
    const orderFn = vi.fn(() => ({ range: rangeFn }));
    const selectFn = vi.fn(() => ({ order: orderFn }));

    const from = vi.fn((table: string) => {
      if (table === "books") return { select: selectFn };
      return { select: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) })) };
    });

    mocks.createAdminClient.mockReturnValue({ from });

    const res = await GET(makeGetRequest({ q: "test" }));
    expect(res.status).toBe(200);
    expect(ilikeFn).toHaveBeenCalledWith("title", "%test%");
  });
});

/* ── DELETE tests ──────────────────────────────────────────────────────────── */

describe("DELETE /api/admin/books", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 without authenticated user", async () => {
    adminDenied(401);
    const res = await DELETE(makeDeleteRequest({ bookId: VALID_UUID }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    adminDenied(403);
    const res = await DELETE(makeDeleteRequest({ bookId: VALID_UUID }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when bookId is missing", async () => {
    adminAllowed();
    const res = await DELETE(makeDeleteRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid UUID", async () => {
    adminAllowed();
    const res = await DELETE(makeDeleteRequest({ bookId: "not-a-uuid" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_INVALID_BOOK_ID);
  });

  it("deletes book successfully with full cleanup", async () => {
    adminAllowed();

    const deletedChapterAudioEq = vi.fn().mockResolvedValue({ error: null });
    const deletedJobsEq = vi.fn().mockResolvedValue({ error: null });
    const deletedImportsEq = vi.fn().mockResolvedValue({ error: null });
    const deletedBookEq = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn((table: string) => {
      if (table === "chapters") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: [{ id: "ch-1" }], error: null }),
          })),
        };
      }
      if (table === "chapter_audio_cache") {
        return {
          delete: vi.fn(() => ({
            in: deletedChapterAudioEq,
          })),
        };
      }
      if (table === "ai_jobs") {
        return {
          delete: vi.fn(() => ({
            eq: deletedJobsEq,
          })),
          select: vi.fn(() => ({
            is: vi.fn(() => ({
              not: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
        };
      }
      if (table === "book_imports") {
        return {
          delete: vi.fn(() => ({
            eq: deletedImportsEq,
          })),
        };
      }
      if (table === "books") {
        return {
          delete: vi.fn(() => ({
            eq: deletedBookEq,
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.createAdminClient.mockReturnValue({ from });

    const res = await DELETE(makeDeleteRequest({ bookId: VALID_UUID }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.bookId).toBe(VALID_UUID);
  });

  it("returns 500 when final book delete fails", async () => {
    adminAllowed();

    const from = vi.fn((table: string) => {
      if (table === "chapters") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      if (table === "ai_jobs") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
          select: vi.fn(() => ({
            is: vi.fn(() => ({
              not: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
        };
      }
      if (table === "book_imports") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === "books") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: { message: "FK violation" } }),
          })),
        };
      }
      return { select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })) };
    });

    mocks.createAdminClient.mockReturnValue({ from });

    const res = await DELETE(makeDeleteRequest({ bookId: VALID_UUID }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(E_DATABASE_ERROR);
  });
});
