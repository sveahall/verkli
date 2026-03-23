import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_TRAILER_LIMIT_REACHED } from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  getBillingStateForUser: vi.fn(),
  isMarketingEnabled: vi.fn(),
  createAdminClient: vi.fn(),
  createPerUserRateLimiter: vi.fn(() => ({
    check: vi.fn(() => ({ allowed: true })),
  })),
  generateTrailerPrompt: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/billing/server", () => ({
  getBillingStateForUser: mocks.getBillingStateForUser,
}));

vi.mock("@/lib/flags", () => ({
  isMarketingEnabled: mocks.isMarketingEnabled,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: mocks.createPerUserRateLimiter,
}));

vi.mock("@/lib/ai/trailer-generation", () => ({
  TrailerGenerateRequestSchema: {
    safeParse: (body: unknown) => ({ success: true, data: body }),
  },
  generateTrailerPrompt: mocks.generateTrailerPrompt,
}));

const { POST } = await import("./route");

function makeRequest(): Request {
  return new Request("http://localhost/api/books/book-1/trailer/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Book title",
      genre: "romance",
      description: "Book description",
      keywords: ["love"],
      tone: "dreamy",
    }),
  });
}

function setupAdminClient(trailerCountThisMonth: number) {
  const booksQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };
  booksQuery.select.mockReturnValue(booksQuery);
  booksQuery.eq.mockReturnValue(booksQuery);
  booksQuery.single.mockResolvedValue({
    data: { id: "book-1", author_id: "author-1" },
    error: null,
  });

  const usageQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    upsert: vi.fn(),
  };
  usageQuery.select.mockReturnValue(usageQuery);
  usageQuery.eq.mockReturnValue(usageQuery);
  usageQuery.maybeSingle.mockResolvedValue({
    data: { trailer_count_this_month: trailerCountThisMonth },
    error: null,
  });
  usageQuery.upsert.mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === "books") return booksQuery;
    if (table === "user_usage_monthly") return usageQuery;
    throw new Error(`Unexpected table in test: ${table}`);
  });

  mocks.createAdminClient.mockReturnValue({ from });
  return { usageQuery };
}

describe("POST /api/books/[id]/trailer/generate guardrail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "author-1" },
      response: null,
    });
    mocks.isMarketingEnabled.mockReturnValue(true);
    mocks.generateTrailerPrompt.mockResolvedValue({
      output: {
        scenes: [],
        caption: "",
        hashtags: [],
        title_card: "",
      },
      metadata: { provider: "template" },
    });
  });

  it("returns 403 E_TRAILER_LIMIT_REACHED for free users at 1 trailer/month", async () => {
    setupAdminClient(1);
    mocks.getBillingStateForUser.mockResolvedValue({
      ok: true,
      row: null,
      state: { isProActive: false } as never,
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "book-1" }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe(E_TRAILER_LIMIT_REACHED);
    expect(mocks.generateTrailerPrompt).not.toHaveBeenCalled();
  });

  it("returns 403 E_TRAILER_LIMIT_REACHED for pro users at 5 trailers/month", async () => {
    setupAdminClient(5);
    mocks.getBillingStateForUser.mockResolvedValue({
      ok: true,
      row: null,
      state: { isProActive: true } as never,
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "book-1" }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe(E_TRAILER_LIMIT_REACHED);
    expect(mocks.generateTrailerPrompt).not.toHaveBeenCalled();
  });
});
