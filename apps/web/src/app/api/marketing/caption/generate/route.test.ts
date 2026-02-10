import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

const VALID_BOOK_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const mockFrom = vi.fn();
const mockGetCachedOrGenerateCaption = vi.fn();

vi.mock("@/lib/auth/require-author-marketing", () => ({
  requireAuthorAndMarketingEnabled: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/marketing/caption-generator", () => ({
  getCachedOrGenerateCaption: (...args: unknown[]) => mockGetCachedOrGenerateCaption(...args),
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

function mockBookOwned(bookId: string, title: string) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { id: bookId, title }, error: null }),
        }),
      }),
    }),
  });
}

function mockBookNotOwned() {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  });
}

describe("POST /api/marketing/caption/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedOrGenerateCaption.mockResolvedValue({ caption: "Generated caption.", fromCache: false });
  });

  it("returns 401 when not authorized", async () => {
    gateUnauthorized();
    const req = new Request("http://localhost/api/marketing/caption/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: VALID_BOOK_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 403 when marketing disabled", async () => {
    gateForbidden();
    const req = new Request("http://localhost/api/marketing/caption/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: VALID_BOOK_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for invalid JSON", async () => {
    gateAuthor("author-1");
    const req = new Request("http://localhost/api/marketing/caption/generate", {
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
    const req = new Request("http://localhost/api/marketing/caption/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for invalid bookId (not UUID)", async () => {
    gateAuthor("author-1");
    const req = new Request("http://localhost/api/marketing/caption/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: "not-a-uuid" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 404 when book not owned", async () => {
    gateAuthor("author-1");
    mockBookNotOwned();
    const req = new Request("http://localhost/api/marketing/caption/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: VALID_BOOK_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 200 and caption on happy path", async () => {
    gateAuthor("author-1");
    mockBookOwned(VALID_BOOK_ID, "My Book");
    const req = new Request("http://localhost/api/marketing/caption/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: VALID_BOOK_ID,
        channel: "instagram",
        contentType: "caption",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("caption", "Generated caption.");
    expect(body).toHaveProperty("fromCache", false);
  });
});
