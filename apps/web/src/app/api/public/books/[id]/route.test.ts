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

const VALID_ID = "11111111-1111-4111-8111-111111111111";
const AUTHOR_ID = "22222222-2222-4222-8222-222222222222";
const ALLOW = () => ({ allowed: true });

function makeRequest(id: string) {
  return new Request(`http://localhost/api/public/books/${id}`);
}

function bookChainResolving(data: unknown, eqCalls: string[]) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((col: string) => {
    eqCalls.push(col);
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

function authorChain(profile: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: profile, error: null }));
  return chain;
}

function listChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => Promise.resolve({ data: rows, error: null }));
  // Some callers chain .eq after .select; make eq return a thenable too:
  const chainable: Record<string, unknown> = {
    select: vi.fn(() => chainable),
    eq: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return chainable;
}

describe("/api/public/books/[id] GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimitCheck.mockImplementation(ALLOW);
  });

  it("returns 400 for input that is neither UUID nor a valid slug", async () => {
    const res = await GET(makeRequest("not a slug!!"), {
      params: Promise.resolve({ id: "not a slug!!" }),
    });
    expect(res.status).toBe(400);
  });

  it("looks up by slug when input is not a UUID", async () => {
    const eqCalls: string[] = [];
    const booksChain = bookChainResolving(null, eqCalls);
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => booksChain),
    });

    const res = await GET(makeRequest("nordic-noir"), {
      params: Promise.resolve({ id: "nordic-noir" }),
    });
    expect(res.status).toBe(404);
    expect(eqCalls).toContain("slug");
    expect(eqCalls).not.toContain("id");
  });

  it("returns 404 when book is not PUBLISHED (drafts do not leak)", async () => {
    const eqCalls: string[] = [];
    const booksChain = bookChainResolving(null, eqCalls);
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => booksChain),
    });

    const res = await GET(makeRequest(VALID_ID), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(404);
    expect(eqCalls).toContain("status");
  });

  it("returns book detail with mapped formats and pricing", async () => {
    const bookRow = {
      id: VALID_ID,
      slug: "nordic-noir",
      title: "Nordic Noir",
      description: "Dark.",
      cover_image: null,
      author_id: AUTHOR_ID,
      language: "sv",
      original_language: "sv",
      audiobook_status: "published",
      print_on_demand_settings: { enabled: false },
      trailer_url: null,
      price_amount: 4900,
      price_currency: "SEK",
      pricing_model: "book_only",
      is_free: false,
      status: "PUBLISHED",
      published_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-04-12T00:00:00Z",
    };

    const eqCalls: string[] = [];
    const booksChain = bookChainResolving(bookRow, eqCalls);
    const profileC = authorChain({ user_id: AUTHOR_ID, display_name: "A. Lindgren", username: "alindgren" });
    const genreC = listChain([{ genres: { name_en: "Thriller", name: "Thriller" } }]);
    const versionC = listChain([
      { language_code: "sv", published_at: "2026-03-01T00:00:00Z" },
    ]);

    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "books") return booksChain;
        if (table === "profiles") return profileC;
        if (table === "book_genres") return genreC;
        if (table === "book_versions") return versionC;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const res = await GET(makeRequest(VALID_ID), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(VALID_ID);
    expect(body.formats).toEqual(expect.arrayContaining(["text", "audio"]));
    expect(body.pricing).toMatchObject({ is_free: false, amount_minor: 4900, currency: "SEK" });
    expect(body.genres).toEqual(["Thriller"]);
    expect(body.available_languages).toEqual(["sv"]);
    expect(body.author).toMatchObject({ name: "A. Lindgren" });
  });
});
