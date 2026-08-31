import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  parseBillingPlan: vi.fn(),
  getPriceIdForRolePlan: vi.fn(),
  getBillingAccountByUserIdAndRole: vi.fn(),
  upsertBillingAccount: vi.fn(),
  createStripeCustomer: vi.fn(),
  createStripeSubscriptionCheckoutSession: vi.fn(),
  resolveBillingRole: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/billing/plans", () => ({ parseBillingPlan: mocks.parseBillingPlan }));
vi.mock("@/lib/billing/catalog", () => ({
  getPriceIdForRolePlan: mocks.getPriceIdForRolePlan,
  DEFAULT_INTERVAL: "month",
}));
vi.mock("@/lib/billing/server", () => ({
  getBillingAccountByUserIdAndRole: mocks.getBillingAccountByUserIdAndRole,
  upsertBillingAccount: mocks.upsertBillingAccount,
}));
vi.mock("@/lib/payments/stripe-billing", () => ({
  createStripeCustomer: mocks.createStripeCustomer,
  createStripeSubscriptionCheckoutSession: mocks.createStripeSubscriptionCheckoutSession,
}));
vi.mock("@/lib/auth/billing-role", () => ({
  resolveBillingRole: mocks.resolveBillingRole,
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

function mockAuthedUser() {
  mocks.createClient.mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1", email: "a@b.com" } } }) },
  });
}

function mockNoUser() {
  mocks.createClient.mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  });
}

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_CHECKOUT_SUCCESS_URL = "http://localhost/billing?status=success";
    process.env.STRIPE_CHECKOUT_CANCEL_URL = "http://localhost/billing?status=cancel";
  });

  it("returns 401 when not authenticated", async () => {
    mockNoUser();
    const req = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "plus" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid plan", async () => {
    mockAuthedUser();
    mocks.parseBillingPlan.mockReturnValue(null);
    const req = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "invalid" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("defaults to reader when no author-role claim present", async () => {
    // Previously returned 403; the route now always resolves an effective
    // billing role (reader by default) so the user gets a signable checkout
    // session instead of being locked out when the cookie is missing.
    mockAuthedUser();
    mocks.parseBillingPlan.mockReturnValue("plus");
    mocks.resolveBillingRole.mockResolvedValue("reader");
    mocks.getPriceIdForRolePlan.mockResolvedValue("price_123");
    mocks.createAdminClient.mockReturnValue({});
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({
      row: { stripe_customer_id: "cus_existing" },
      error: null,
    });
    mocks.createStripeSubscriptionCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.com/session_reader",
    });
    const req = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "plus" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mocks.resolveBillingRole).toHaveBeenCalled();
  });

  it("returns checkout URL on success", async () => {
    mockAuthedUser();
    mocks.parseBillingPlan.mockReturnValue("plus");
    mocks.resolveBillingRole.mockResolvedValue("reader");
    mocks.getPriceIdForRolePlan.mockResolvedValue("price_123");
    mocks.createAdminClient.mockReturnValue({});
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({
      row: { stripe_customer_id: "cus_existing" },
      error: null,
    });
    mocks.createStripeSubscriptionCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.com/session_123",
    });

    const req = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "plus" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("stripe.com");
  });

  /**
   * The interval decides whether the customer is charged once or twelve times
   * over, so it gets asserted rather than assumed.
   */
  function arrangeCheckout(plan: "plus" | "pro", role: "reader" | "author") {
    mockAuthedUser();
    mocks.parseBillingPlan.mockReturnValue(plan);
    mocks.resolveBillingRole.mockResolvedValue(role);
    mocks.getPriceIdForRolePlan.mockResolvedValue("price_123");
    mocks.createAdminClient.mockReturnValue({});
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({
      row: { stripe_customer_id: "cus_existing" },
      error: null,
    });
    mocks.createStripeSubscriptionCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.com/session_123",
    });
  }

  function checkoutRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("asks the catalog for the annual price when interval is year", async () => {
    arrangeCheckout("pro", "author");

    const res = await POST(checkoutRequest({ plan: "pro", interval: "year" }));

    expect(res.status).toBe(200);
    expect(mocks.getPriceIdForRolePlan).toHaveBeenCalledWith("author", "pro", "year");
  });

  it("bills monthly when no interval is given", async () => {
    arrangeCheckout("pro", "author");

    const res = await POST(checkoutRequest({ plan: "pro" }));

    expect(res.status).toBe(200);
    expect(mocks.getPriceIdForRolePlan).toHaveBeenCalledWith("author", "pro", "month");
  });

  it("bills monthly for an unrecognised interval rather than guessing", async () => {
    arrangeCheckout("pro", "author");

    // A typo, a stale client, a hand-rolled request — none of them should be
    // able to turn one month into twelve.
    const res = await POST(checkoutRequest({ plan: "pro", interval: "yearly-ish" }));

    expect(res.status).toBe(200);
    expect(mocks.getPriceIdForRolePlan).toHaveBeenCalledWith("author", "pro", "month");
  });

  it("creates new Stripe customer when none exists", async () => {
    mockAuthedUser();
    mocks.parseBillingPlan.mockReturnValue("plus");
    mocks.resolveBillingRole.mockResolvedValue("reader");
    mocks.getPriceIdForRolePlan.mockResolvedValue("price_123");
    mocks.createAdminClient.mockReturnValue({});
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({
      row: { stripe_customer_id: null },
      error: null,
    });
    mocks.createStripeCustomer.mockResolvedValue({ id: "cus_new" });
    mocks.upsertBillingAccount.mockResolvedValue({ error: null });
    mocks.createStripeSubscriptionCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.com/session_456",
    });

    const req = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "plus" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mocks.createStripeCustomer).toHaveBeenCalledWith({
      userId: "user-1",
      email: "a@b.com",
    });
  });
});
