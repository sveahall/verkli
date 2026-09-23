import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn() },
    from: mockFrom,
  })),
}));

const { createClient } = await import("@/lib/supabase/server");

const VALID_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_UUID_2 = "b1ffcd00-0d1c-4f09-8c7e-7cc0ce491b22";
const VALID_UUID_3 = "c2aade11-1e2d-4a10-9d8f-8dd1df502c33";

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

describe("GET /api/reader/highlights", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockSupabaseNoUser();
    const req = new Request(`http://localhost/api/reader/highlights?chapter_id=${VALID_UUID}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when chapter_id is missing", async () => {
    mockSupabaseWithUser();
    const req = new Request("http://localhost/api/reader/highlights");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns highlights for a chapter", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () =>
              Promise.resolve({
                data: [
                  { id: "h-1", chapter_id: VALID_UUID, start_offset: 0, end_offset: 10, snippet: "Hello", color: "yellow" },
                ],
                error: null,
              }),
          }),
        }),
      }),
    });
    const req = new Request(`http://localhost/api/reader/highlights?chapter_id=${VALID_UUID}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.highlights).toHaveLength(1);
    expect(body.highlights[0].id).toBe("h-1");
  });
});

describe("POST /api/reader/highlights", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockSupabaseNoUser();
    const req = new Request("http://localhost/api/reader/highlights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapter_id: VALID_UUID,
        book_id: VALID_UUID_2,
        book_version_id: VALID_UUID_3,
        start_offset: 0,
        end_offset: 10,
        snippet: "Hello",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    mockSupabaseWithUser();
    const req = new Request("http://localhost/api/reader/highlights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter_id: "not-uuid" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when end_offset <= start_offset", async () => {
    mockSupabaseWithUser();
    const req = new Request("http://localhost/api/reader/highlights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapter_id: VALID_UUID,
        book_id: VALID_UUID_2,
        book_version_id: VALID_UUID_3,
        start_offset: 10,
        end_offset: 5,
        snippet: "Hello",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates highlight successfully", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: {
                id: "h-new",
                chapter_id: VALID_UUID,
                book_id: VALID_UUID_2,
                book_version_id: VALID_UUID_3,
                start_offset: 0,
                end_offset: 10,
                snippet: "Hello",
                color: "yellow",
                note: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
        }),
      }),
    });
    const req = new Request("http://localhost/api/reader/highlights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapter_id: VALID_UUID,
        book_id: VALID_UUID_2,
        book_version_id: VALID_UUID_3,
        start_offset: 0,
        end_offset: 10,
        snippet: "Hello",
        color: "green",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.highlight.id).toBe("h-new");
  });

  it("returns 409 on duplicate highlight", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: null,
              error: { code: "23505", message: "duplicate" },
            }),
        }),
      }),
    });
    const req = new Request("http://localhost/api/reader/highlights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapter_id: VALID_UUID,
        book_id: VALID_UUID_2,
        book_version_id: VALID_UUID_3,
        start_offset: 0,
        end_offset: 10,
        snippet: "Hello",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });
});
