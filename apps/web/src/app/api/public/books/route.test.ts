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

const ALLOW = () => ({ allowed: true });

function makeRequest(qs = "") {
  return new Request(`http://localhost/api/public/books${qs ? `?${qs}` : ""}`);
}

type ChainResult = { data: unknown; count: number | null; error: unknown };

function buildBooksChain(result: ChainResult, calls: { eq: string[]; ilikeCalled: boolean; rangeCalled: boolean }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((col: string) => {
    calls.eq.push(col);
    return chain;
  });
  chain.ilike = vi.fn(() => {
    calls.ilikeCalled = true;
    return chain;
  });
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => {
    calls.rangeCalled = true;
    return chain;
  });
  // Thenable: `await chain` resolves to the result
  chain.then = (resolve: (v: ChainResult) => void) => resolve(result);
  return chain;
}

function buildAuthorsChain(rows: Array<{ user_id: string; display_name: string | null; username: string | null }>) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.in = vi.fn(() => Promise.resolve({ data: rows, error: null }));
  return chain;
}

describe("/api/public/books GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimitCheck.mockImplementation(ALLOW);
  });

  it("returns published books only (filters status=PUBLISHED)", async () => {
    const calls = { eq: [] as string[], ilikeCalled: false, rangeCalled: false };
    const booksChain = buildBooksChain(
      {
        data: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            slug: "test",
            title: "Test Book",
            description: null,
            cover_image: null,
            author_id: "22222222-2222-4222-8222-222222222222",
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
        ],
        count: 1,
        error: null,
      },
      calls
    );
    const authorsChain = buildAuthorsChain([
      { user_id: "22222222-2222-4222-8222-222222222222", display_name: "Author", username: "auth" },
    ]);

    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => (table === "books" ? booksChain : authorsChain)),
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(calls.eq).toContain("status");
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: expect.any(String), title: "Test Book", pricing: { is_free: true } });
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it("applies title search via ilike when q is given", async () => {
    const calls = { eq: [] as string[], ilikeCalled: false, rangeCalled: false };
    const booksChain = buildBooksChain({ data: [], count: 0, error: null }, calls);
    const authorsChain = buildAuthorsChain([]);
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => (table === "books" ? booksChain : authorsChain)),
    });

    const res = await GET(makeRequest("q=Nordic"));
    expect(res.status).toBe(200);
    expect(calls.ilikeCalled).toBe(true);
  });

  it("returns 400 on invalid query (limit > 50)", async () => {
    const res = await GET(makeRequest("limit=999"));
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate-limited", async () => {
    mocks.rateLimitCheck.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 30 });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
  });
});
