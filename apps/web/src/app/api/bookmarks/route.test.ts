import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, DELETE } from "./route";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn() },
    from: mockFrom,
  })),
}));

const { createClient } = await import("@/lib/supabase/server");

const VALID_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function mockSupabaseWithUser() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    from: mockFrom,
  } as never);
}

function mockSupabaseNoUser() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    from: mockFrom,
  } as never);
}

describe("GET /api/bookmarks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockSupabaseNoUser();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 and list when authenticated", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({
              data: [{ id: "bm-1", book_id: "book-1", created_at: new Date().toISOString() }],
              error: null,
            }),
        }),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("bookmarks");
    expect(Array.isArray(body.bookmarks)).toBe(true);
  });
});

describe("POST /api/bookmarks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockSupabaseNoUser();
    const req = new Request("http://localhost/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: VALID_UUID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid bookId", async () => {
    mockSupabaseWithUser();
    const req = new Request("http://localhost/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: "not-a-uuid" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 and inserts bookmark when authenticated", async () => {
    mockSupabaseWithUser();
    const bookmarksInsert = {
      insert: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: {
                id: "bm-1",
                book_id: VALID_UUID,
                created_at: new Date().toISOString(),
              },
              error: null,
            }),
        }),
      }),
    };
    const analyticsInsert = { insert: () => Promise.resolve({ error: null }) };
    mockFrom.mockImplementation((table: string) => {
      if (table === "bookmarks") return bookmarksInsert;
      if (table === "analytics_events") return analyticsInsert;
      return {};
    });
    const bodyJson = JSON.stringify({ bookId: VALID_UUID });
    const req = new Request("http://localhost/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyJson,
    });
    const res = await POST(req);
    if (res.status !== 200) {
      const err = await res.json();
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(err)}`);
    }
    const body = await res.json();
    expect(body).toHaveProperty("id", "bm-1");
    expect(body).toHaveProperty("book_id", VALID_UUID);
  });

  it("returns 409 when unique constraint (already bookmarked)", async () => {
    mockSupabaseWithUser();
    mockFrom.mockImplementation((table: string) => {
      if (table === "bookmarks") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: null,
                  error: { code: "23505" },
                }),
            }),
          }),
        };
      }
      return {};
    });
    const req = new Request("http://localhost/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: VALID_UUID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/bookmarks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockSupabaseNoUser();
    const req = new Request(`http://localhost/api/bookmarks?bookId=${VALID_UUID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing or invalid bookId", async () => {
    mockSupabaseWithUser();
    const req = new Request("http://localhost/api/bookmarks", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 when delete succeeds", async () => {
    mockSupabaseWithUser();
    const bookmarksChain = {
      delete: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "bm-1" },
                  error: null,
                }),
            }),
          }),
        }),
      }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "bookmarks") return bookmarksChain;
      if (table === "analytics_events") return { insert: () => Promise.resolve({ error: null }) };
      return {};
    });
    const url = `http://localhost/api/bookmarks?bookId=${VALID_UUID}`;
    const req = new Request(url, { method: "DELETE" });
    const res = await DELETE(req);
    if (res.status !== 200) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(err)}`);
    }
    const body = await res.json();
    expect(body).toHaveProperty("ok", true);
  });
});
