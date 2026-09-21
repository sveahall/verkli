import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  requireProBillingForApi: vi.fn(),
  createCreditTopUpCheckoutSession: vi.fn(),
  getStripeCheckoutSession: vi.fn(),
  // Server-owned pricing. Tests drive the gate and the pack table so they do
  // not break every time real prices are agreed.
  pricing: { confirmed: true },
}));

const TEST_PACK = { id: "small", amountMinor: 9900, credits: 500, currency: "SEK" } as const;

vi.mock("@/lib/billing/credit-packs", () => ({
  get CREDIT_PRICING_CONFIRMED() {
    return mocks.pricing.confirmed;
  },
  getCreditPack: (id: unknown) => (id === TEST_PACK.id ? TEST_PACK : null),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: mocks.requireProBillingForApi,
}));
vi.mock("@/lib/payments/stripe", () => ({
  createCreditTopUpCheckoutSession: mocks.createCreditTopUpCheckoutSession,
  getStripeCheckoutSession: mocks.getStripeCheckoutSession,
}));
vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({
    check: () => ({ allowed: true }),
  }),
}));

// Force in-memory rate limiter (no Redis)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

const { POST } = await import("./route");

function mockUser(id = "user-1") {
  mocks.createClient.mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id, email: "u@test.com" } } }) },
  });
}

function mockNoUser() {
  mocks.createClient.mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  });
}

function makeReq(body: unknown) {
  return new Request("http://localhost/api/credits/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

let lastInsert: Record<string, unknown> | null = null;

function mockAdminInsertSuccess(id = "topup-1") {
  lastInsert = null;
  const chainable = {
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => chainable),
      insert: vi.fn((row: Record<string, unknown>) => {
        lastInsert = row;
        return {
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
          })),
        };
      }),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        })),
      })),
    })),
  });
}

describe("POST /api/credits/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pricing.confirmed = true;
  });

  it("does not exist while credit pricing is unconfirmed", async () => {
    // The packs ship as placeholders. A route that charges real cards must not
    // be reachable just because the file exists.
    mocks.pricing.confirmed = false;
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });

    const res = await POST(makeReq({ packId: "small" }));

    expect(res.status).toBe(404);
    expect(mocks.createCreditTopUpCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mockNoUser();
    expect((await POST(makeReq({ packId: "small" }))).status).toBe(401);
  });

  it("returns 403 when user lacks Pro billing", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "PRO_REQUIRED" }), { status: 403 }),
    });
    expect((await POST(makeReq({ packId: "small" }))).status).toBe(403);
  });

  it("returns 400 for a pack that does not exist", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });
    expect((await POST(makeReq({ packId: "enormous" }))).status).toBe(400);
  });

  it("returns 400 when the caller names a price instead of a pack", async () => {
    // The old contract. Anything that still sends it gets nothing.
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });
    const res = await POST(makeReq({ amountMinor: 1, creditsDelta: 99_000_000 }));
    expect(res.status).toBe(400);
    expect(mocks.createCreditTopUpCheckoutSession).not.toHaveBeenCalled();
  });

  it("charges the server's price, never the caller's", async () => {
    // The vulnerability this replaced: pay 1 öre, ask for 99 million credits.
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });
    mockAdminInsertSuccess("topup-1");
    mocks.createCreditTopUpCheckoutSession.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/cs_test_123",
    });

    const res = await POST(
      makeReq({ packId: "small", amountMinor: 1, creditsDelta: 99_000_000, currency: "XXX" })
    );

    expect(res.status).toBe(200);
    expect(lastInsert).toMatchObject({
      amount: TEST_PACK.amountMinor,
      credits_delta: TEST_PACK.credits,
      currency: TEST_PACK.currency,
    });
    expect(lastInsert?.credits_delta).not.toBe(99_000_000);
  });

  it("returns checkout URL on success", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });
    mockAdminInsertSuccess("topup-1");
    mocks.createCreditTopUpCheckoutSession.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/cs_test_123",
    });

    const res = await POST(makeReq({ packId: "small" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("stripe.com");
    expect(body.creditTopupId).toBe("topup-1");
  });

  it("returns 500 when Stripe session creation fails", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });
    mockAdminInsertSuccess("topup-2");
    mocks.createCreditTopUpCheckoutSession.mockRejectedValue(new Error("stripe down"));

    const res = await POST(makeReq({ packId: "small" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("CHECKOUT_SESSION_FAILED");
  });
});
