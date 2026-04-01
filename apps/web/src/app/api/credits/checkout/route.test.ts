import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  requireProBillingForApi: vi.fn(),
  createCreditTopUpCheckoutSession: vi.fn(),
  getStripeCheckoutSession: vi.fn(),
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

function mockAdminInsertSuccess(id = "topup-1") {
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
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
        })),
      })),
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
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockNoUser();
    const res = await POST(makeReq({ amountMinor: 5000, creditsDelta: 100 }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks Pro billing", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "PRO_REQUIRED" }), { status: 403 }),
    });
    const res = await POST(makeReq({ amountMinor: 5000, creditsDelta: 100 }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when amountMinor is zero", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });
    const res = await POST(makeReq({ amountMinor: 0, creditsDelta: 100 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when creditsDelta is zero", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });
    const res = await POST(makeReq({ amountMinor: 5000, creditsDelta: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns checkout URL on success", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });
    mockAdminInsertSuccess("topup-1");
    mocks.createCreditTopUpCheckoutSession.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/cs_test_123",
    });

    const res = await POST(makeReq({ amountMinor: 5000, creditsDelta: 100 }));
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

    const res = await POST(makeReq({ amountMinor: 5000, creditsDelta: 100 }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("CHECKOUT_SESSION_FAILED");
  });
});
