import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";

const VALID_BOOK_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const mockFrom = vi.fn();

vi.mock("@/lib/auth/require-author-marketing", () => ({
  requireAuthorAndMarketingEnabled: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

const { requireAuthorAndMarketingEnabled } = await import("@/lib/auth/require-author-marketing");

function gateAuthor(userId: string) {
  vi.mocked(requireAuthorAndMarketingEnabled).mockResolvedValue({
    user: { id: userId } as never,
    response: null,
  });
}

function gateUnauthorized() {
  vi.mocked(requireAuthorAndMarketingEnabled).mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401 }),
  });
}

function gateForbidden() {
  vi.mocked(requireAuthorAndMarketingEnabled).mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "MARKETING_FEATURE_DISABLED" }), { status: 403 }),
  });
}

function mockBooksAndAssets(book: { id: string } | null, assets: unknown[] = []) {
  const bookChain = {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: book, error: null }),
        }),
      }),
    }),
  };
  const assetsChain = {
    select: () => ({
      eq: () => ({
        order: () =>
          Promise.resolve({
            data: assets.length
              ? assets
              : [
                  {
                    id: "asset-1",
                    book_id: VALID_BOOK_ID,
                    channel: "instagram",
                    language: "sv",
                    content_type: "caption",
                    text: "Caption text",
                    metadata: {},
                    created_at: new Date().toISOString(),
                  },
                ],
            error: null,
          }),
      }),
    }),
  };
  mockFrom.mockImplementation((table: string) => {
    if (table === "books") return bookChain;
    if (table === "marketing_assets") return assetsChain;
    return {};
  });
}

function mockAssetsInsert(inserted: Record<string, unknown>) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "books") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: VALID_BOOK_ID, title: "Book" },
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    if (table === "marketing_assets") {
      return {
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: inserted, error: null }),
          }),
        }),
      };
    }
    return {};
  });
}

describe("GET /api/marketing/assets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authorized", async () => {
    gateUnauthorized();
    const req = new Request(`http://localhost/api/marketing/assets?bookId=${VALID_BOOK_ID}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 403 when marketing disabled", async () => {
    gateForbidden();
    const req = new Request(`http://localhost/api/marketing/assets?bookId=${VALID_BOOK_ID}`);
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when bookId missing", async () => {
    gateAuthor("author-1");
    const req = new Request("http://localhost/api/marketing/assets");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when bookId invalid (not UUID)", async () => {
    gateAuthor("author-1");
    const req = new Request("http://localhost/api/marketing/assets?bookId=not-a-uuid");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 404 when book not owned", async () => {
    gateAuthor("author-1");
    mockBooksAndAssets(null);
    const req = new Request(`http://localhost/api/marketing/assets?bookId=${VALID_BOOK_ID}`);
    const res = await GET(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 200 and assets list on happy path", async () => {
    gateAuthor("author-1");
    mockBooksAndAssets({ id: VALID_BOOK_ID });
    const req = new Request(`http://localhost/api/marketing/assets?bookId=${VALID_BOOK_ID}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("assets");
    expect(Array.isArray(body.assets)).toBe(true);
  });
});

describe("POST /api/marketing/assets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authorized", async () => {
    gateUnauthorized();
    const req = new Request("http://localhost/api/marketing/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: VALID_BOOK_ID,
        channel: "instagram",
        text: "Caption text",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 403 when marketing disabled", async () => {
    gateForbidden();
    const req = new Request("http://localhost/api/marketing/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: VALID_BOOK_ID,
        channel: "instagram",
        text: "Caption text",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for invalid JSON", async () => {
    gateAuthor("author-1");
    const req = new Request("http://localhost/api/marketing/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for invalid body (missing bookId)", async () => {
    gateAuthor("author-1");
    const req = new Request("http://localhost/api/marketing/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "instagram", text: "Hi" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for invalid body (missing text)", async () => {
    gateAuthor("author-1");
    const req = new Request("http://localhost/api/marketing/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: VALID_BOOK_ID, channel: "instagram" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 404 when book not owned", async () => {
    gateAuthor("author-1");
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    });
    const req = new Request("http://localhost/api/marketing/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: VALID_BOOK_ID,
        channel: "instagram",
        text: "Caption text",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 200 and inserted asset on happy path", async () => {
    gateAuthor("author-1");
    const inserted = {
      id: "asset-1",
      book_id: VALID_BOOK_ID,
      channel: "instagram",
      language: "sv",
      content_type: "caption",
      text: "Caption text",
      metadata: {},
      created_at: new Date().toISOString(),
    };
    mockAssetsInsert(inserted);
    const req = new Request("http://localhost/api/marketing/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: VALID_BOOK_ID,
        channel: "instagram",
        text: "Caption text",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id", "asset-1");
    expect(body).toHaveProperty("book_id", VALID_BOOK_ID);
    expect(body).toHaveProperty("text", "Caption text");
  });
});
