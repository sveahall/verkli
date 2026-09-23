import { describe, it, expect, vi, beforeEach } from "vitest";
import { CREDIT_PACKS } from "@/lib/billing/credit-packs";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  requireProBillingForApi: vi.fn(),
  createCreditTopUpCheckoutSession: vi.fn(),
  getStripeCheckoutSession: vi.fn(),
}));

// The route 404s while the shipped pack prices are unconfirmed. Keep the real
// packs (the assertions below compare against them) and flip only the flag, so
// the behavioural tests exercise the route as it will run once pricing lands.
//
// This mock would hide the gate from every test in this file, so the gate has
// its own file where the module is untouched: ./route.pricing-gate.test.ts.
// Verified to fail when the `if (!CREDIT_PRICING_CONFIRMED)` block is deleted.
vi.mock("@/lib/billing/credit-packs", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/billing/credit-packs")>();
  return { ...actual, CREDIT_PRICING_CONFIRMED: true };
});

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
    const res = await POST(makeReq({ packId: "medium" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks Pro billing", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "PRO_REQUIRED" }), { status: 403 }),
    });
    const res = await POST(makeReq({ packId: "medium" }));
    expect(res.status).toBe(403);
  });

  // amountMinor and creditsDelta no longer exist in the request body — the two
  // tests that used to live here validated client-supplied values, which was
  // the vulnerability. A body carrying only those fields must now 400 for the
  // missing packId, not succeed on them.
  it("returns 400 when no packId is given", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });
    const res = await POST(makeReq({ amountMinor: 5000, creditsDelta: 100 }));
    expect(res.status).toBe(400);
    expect(mocks.createCreditTopUpCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns checkout URL on success", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });
    mockAdminInsertSuccess("topup-1");
    mocks.createCreditTopUpCheckoutSession.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/cs_test_123",
    });

    const res = await POST(makeReq({ packId: "medium" }));
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

    const res = await POST(makeReq({ packId: "medium" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("CHECKOUT_SESSION_FAILED");
  });

  // The route used to take amountMinor AND creditsDelta from the body with only
  // a > 0 check, so 3 SEK could buy a hundred million credits. These two lock
  // the server-owned pricing in place.
  it("rejects an unknown packId instead of falling back to a client price", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });

    for (const packId of ["enormous", "", null, 42, { id: "medium" }, "constructor"]) {
      const res = await POST(makeReq({ packId }));
      expect(res.status).toBe(400);
    }
    expect(mocks.createCreditTopUpCheckoutSession).not.toHaveBeenCalled();
  });

  it("charges the pack's price and credits, ignoring anything the client sends", async () => {
    mockUser();
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true });
    mockAdminInsertSuccess("topup-3");
    mocks.createCreditTopUpCheckoutSession.mockResolvedValue({
      id: "cs_test_789",
      url: "https://checkout.stripe.com/cs_test_789",
    });

    // A caller trying the old exploit: pay 3 SEK, ask for 100 million credits.
    await POST(
      makeReq({
        packId: "small",
        amountMinor: 300,
        creditsDelta: 100_000_000,
        credits: 100_000_000,
        currency: "XXX",
      })
    );

    expect(mocks.createCreditTopUpCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: CREDIT_PACKS.small.amountMinor,
        creditsDelta: CREDIT_PACKS.small.credits,
        currency: CREDIT_PACKS.small.currency,
      })
    );
  });
});
