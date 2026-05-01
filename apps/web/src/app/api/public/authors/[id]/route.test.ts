import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  rateLimitCheck: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({
    check: (...args: unknown[]) => mocks.rateLimitCheck(...args),
  }),
}));

const { GET } = await import("./route");

const AUTHOR_ID = "22222222-2222-4222-8222-222222222222";
const ALLOW = () => ({ allowed: true });

function profileChain(data: unknown, eqColumns?: string[]) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((col: string) => {
    eqColumns?.push(col);
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

function booksChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data: rows, error: null }));
  return chain;
}

function makeRequest() {
  return new Request(`http://localhost/api/public/authors/${AUTHOR_ID}`);
}

describe("/api/public/authors/[id] GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimitCheck.mockImplementation(ALLOW);
  });

  it("returns 400 for input that is neither UUID nor a valid username", async () => {
    const res = await GET(new Request("http://localhost/api/public/authors/bad%20handle"), {
      params: Promise.resolve({ id: "bad handle" }),
    });
    expect(res.status).toBe(400);
  });

  it("looks up by username when input is not a UUID", async () => {
    const profile = {
      user_id: AUTHOR_ID,
      display_name: "Demo",
      username: "demo-author",
      bio: null,
      avatar_url: null,
      is_public: true,
      website_url: null,
      social_links: null,
    };
    const eqCols: string[] = [];
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((t: string) => (t === "profiles" ? profileChain(profile, eqCols) : booksChain([]))),
    });
    const res = await GET(new Request("http://localhost/api/public/authors/demo-author"), {
      params: Promise.resolve({ id: "demo-author" }),
    });
    expect(res.status).toBe(200);
    expect(eqCols).toContain("username");
    expect(eqCols).not.toContain("user_id");
    const body = await res.json();
    expect(body.username).toBe("demo-author");
  });

  it("returns 404 for private profile with no published books", async () => {
    const profile = {
      user_id: AUTHOR_ID,
      display_name: "Hidden",
      username: "hidden",
      bio: null,
      avatar_url: null,
      is_public: false,
      website_url: null,
      social_links: null,
    };
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((t: string) => (t === "profiles" ? profileChain(profile) : booksChain([]))),
    });
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: AUTHOR_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 for private profile WITH at least one published book", async () => {
    const profile = {
      user_id: AUTHOR_ID,
      display_name: "Quiet Author",
      username: "quiet",
      bio: "Just here for the books.",
      avatar_url: null,
      is_public: false,
      website_url: null,
      social_links: { twitter: "https://x.com/quiet" },
    };
    const books = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        slug: "test",
        title: "Test",
        description: null,
        cover_image: null,
        author_id: AUTHOR_ID,
        language: "en",
        original_language: "en",
        audiobook_status: null,
        print_on_demand_settings: { enabled: false },
        trailer_url: null,
        price_amount: 0,
        price_currency: "USD",
        pricing_model: "book_only",
        is_free: true,
        status: "PUBLISHED",
        published_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((t: string) => (t === "profiles" ? profileChain(profile) : booksChain(books))),
    });

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: AUTHOR_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(AUTHOR_ID);
    expect(body.name).toBe("Quiet Author");
    expect(body.same_as).toEqual(["https://x.com/quiet"]);
    expect(body.books).toHaveLength(1);
  });
});
