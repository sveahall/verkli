import { describe, it, expect, vi, beforeEach } from "vitest";

// Force in-memory rate limiter (no Redis)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getBillingAccountByUserIdAndRole: vi.fn(),
  upsertBillingAccount: vi.fn(),
  createStripeCustomer: vi.fn(),
  createStripeCustomerPortalSession: vi.fn(),
  listStripeCustomersByEmail: vi.fn(),
  getStripeCustomerSubscriptions: vi.fn(),
  resolveRolePlanFromPriceIds: vi.fn(),
  resolveBillingRole: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/billing/server", () => ({
  getBillingAccountByUserIdAndRole: mocks.getBillingAccountByUserIdAndRole,
  upsertBillingAccount: mocks.upsertBillingAccount,
}));
vi.mock("@/lib/billing/catalog", () => ({
  resolveRolePlanFromPriceIds: mocks.resolveRolePlanFromPriceIds,
}));
vi.mock("@/lib/billing/plans", () => ({
  parseBillingPlan: vi.fn(() => null),
  planToPersist: vi.fn(() => "plus"),
}));
vi.mock("@/lib/payments/stripe-billing", () => ({
  createStripeCustomer: mocks.createStripeCustomer,
  createStripeCustomerPortalSession: mocks.createStripeCustomerPortalSession,
  listStripeCustomersByEmail: mocks.listStripeCustomersByEmail,
  getStripeCustomerSubscriptions: mocks.getStripeCustomerSubscriptions,
}));
vi.mock("@/lib/auth/billing-role", () => ({
  resolveBillingRole: mocks.resolveBillingRole,
}));

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

describe("POST /api/billing/portal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockNoUser();
    const req = new Request("http://localhost/api/billing/portal", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("defaults to reader when no author-role claim present", async () => {
    // Previously returned 403; the portal is now always accessible for an
    // authenticated user — `resolveBillingRole` demotes an unverified
    // "author" cookie to "reader" automatically.
    mockAuthedUser();
    mocks.resolveBillingRole.mockResolvedValue("reader");
    mocks.createAdminClient.mockReturnValue({});
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({
      row: { stripe_customer_id: "cus_existing" },
      error: null,
    });
    mocks.createStripeCustomerPortalSession.mockResolvedValue({
      url: "https://billing.stripe.com/portal_default",
    });
    const req = new Request("http://localhost/api/billing/portal", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns portal URL on success", async () => {
    mockAuthedUser();
    mocks.resolveBillingRole.mockResolvedValue("reader");
    mocks.createAdminClient.mockReturnValue({});
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({
      row: { stripe_customer_id: "cus_existing" },
      error: null,
    });
    mocks.createStripeCustomerPortalSession.mockResolvedValue({
      url: "https://billing.stripe.com/portal_session_123",
    });

    const req = new Request("http://localhost/api/billing/portal", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("stripe.com");
  });

  it("creates new Stripe customer when none exists", async () => {
    mockAuthedUser();
    mocks.resolveBillingRole.mockResolvedValue("author");
    mocks.createAdminClient.mockReturnValue({});
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({
      row: { stripe_customer_id: null },
      error: null,
    });
    mocks.listStripeCustomersByEmail.mockResolvedValue([]);
    mocks.createStripeCustomer.mockResolvedValue({ id: "cus_new" });
    mocks.upsertBillingAccount.mockResolvedValue({ error: null });
    mocks.createStripeCustomerPortalSession.mockResolvedValue({
      url: "https://billing.stripe.com/portal_new",
    });

    const req = new Request("http://localhost/api/billing/portal", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mocks.createStripeCustomer).toHaveBeenCalled();
  });

  it("returns 500 when portal session creation fails", async () => {
    mockAuthedUser();
    mocks.resolveBillingRole.mockResolvedValue("reader");
    mocks.createAdminClient.mockReturnValue({});
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({
      row: { stripe_customer_id: "cus_existing" },
      error: null,
    });
    mocks.createStripeCustomerPortalSession.mockRejectedValue(new Error("Stripe API error"));

    const req = new Request("http://localhost/api/billing/portal", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
