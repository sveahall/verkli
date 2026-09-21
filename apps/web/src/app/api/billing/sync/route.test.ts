import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getCheckoutSessionWithLineItems: vi.fn(),
  getStripeCustomerSubscriptions: vi.fn(),
  listStripeCustomersByEmail: vi.fn(),
  resolveRolePlanFromPriceIds: vi.fn(),
  parseBillingPlan: vi.fn(),
  planToPersist: vi.fn(),
  getBillingAccountByUserIdAndRole: vi.fn(),
  upsertBillingAccount: vi.fn(),
  resolveBillingRole: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/payments/stripe-billing", () => ({
  getCheckoutSessionWithLineItems: mocks.getCheckoutSessionWithLineItems,
  getStripeCustomerSubscriptions: mocks.getStripeCustomerSubscriptions,
  listStripeCustomersByEmail: mocks.listStripeCustomersByEmail,
}));
vi.mock("@/lib/billing/catalog", () => ({
  resolveRolePlanFromPriceIds: mocks.resolveRolePlanFromPriceIds,
}));
vi.mock("@/lib/billing/plans", () => ({
  parseBillingPlan: mocks.parseBillingPlan,
  planToPersist: mocks.planToPersist,
}));
vi.mock("@/lib/billing/server", () => ({
  getBillingAccountByUserIdAndRole: mocks.getBillingAccountByUserIdAndRole,
  upsertBillingAccount: mocks.upsertBillingAccount,
}));
vi.mock("@/lib/auth/billing-role", () => ({
  resolveBillingRole: mocks.resolveBillingRole,
}));

// Force in-memory rate limiter (no Redis)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

const { POST, GET } = await import("./route");

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

function makePostReq(body: unknown) {
  return new Request("http://localhost/api/billing/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetReq() {
  return new Request("http://localhost/api/billing/sync");
}

describe("billing sync recovery ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "recovery-user", email: "shared@example.com", email_confirmed_at: "2026-09-21T00:00:00Z" } } }) },
    });
    mocks.createAdminClient.mockReturnValue({});
    mocks.resolveBillingRole.mockResolvedValue("author");
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({ row: null, error: null });
    mocks.listStripeCustomersByEmail.mockResolvedValue([{ id: "cus_recovered" }]);
    mocks.resolveRolePlanFromPriceIds.mockResolvedValue({ role: "author", planKey: "pro" });
    mocks.planToPersist.mockReturnValue("pro");
    mocks.upsertBillingAccount.mockResolvedValue({ error: null });
  });

  it.each([{}, { user_id: "other-user" }])("does not adopt an email match without matching owner metadata: %j", async (metadata) => {
    mocks.getStripeCustomerSubscriptions.mockResolvedValue([{ id: "sub_other", status: "active", price_ids: ["price_pro"], metadata }]);
    const res = await GET(makeGetReq());
    expect(await res.json()).toEqual({ ok: false, reason: "no_matching_subscription" });
    expect(mocks.upsertBillingAccount).not.toHaveBeenCalled();
  });

  it("recovers an active subscription belonging to the authenticated user", async () => {
    mocks.getStripeCustomerSubscriptions.mockResolvedValue([{ id: "sub_owned", status: "active", price_ids: ["price_pro"], metadata: { user_id: "recovery-user" } }]);
    const res = await GET(makeGetReq());
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.upsertBillingAccount).toHaveBeenCalledWith(expect.anything(), "recovery-user", "author", expect.objectContaining({ stripe_customer_id: "cus_recovered", stripe_subscription_id: "sub_owned" }));
  });

  it("continues syncing an already bound legacy customer without recovery metadata", async () => {
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({ row: { stripe_customer_id: "cus_bound" }, error: null });
    mocks.getStripeCustomerSubscriptions.mockResolvedValue([{ id: "sub_bound", status: "active", price_ids: ["price_pro"], metadata: {} }]);
    const res = await GET(makeGetReq());
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.listStripeCustomersByEmail).not.toHaveBeenCalled();
    expect(mocks.upsertBillingAccount).toHaveBeenCalledWith(expect.anything(), "recovery-user", "author", expect.objectContaining({ stripe_customer_id: "cus_bound" }));
  });
});

describe("POST /api/billing/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({});
  });

  it("returns 401 when not authenticated", async () => {
    mockNoUser();
    const res = await POST(makePostReq({ session_id: "cs_test" }));
    expect(res.status).toBe(401);
  });

  it("defaults to reader when no author-role claim present", async () => {
    // Previously returned 403; the route now always resolves to an effective
    // billing role. With a non-subscription session we reach the 400 path.
    mockUser();
    mocks.resolveBillingRole.mockResolvedValue("reader");
    mocks.getCheckoutSessionWithLineItems.mockResolvedValue({
      mode: "payment",
      metadata: { user_id: "user-1" },
    });
    const res = await POST(makePostReq({ session_id: "cs_test" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when session_id is missing", async () => {
    mockUser();
    mocks.resolveBillingRole.mockResolvedValue("reader");
    const res = await POST(makePostReq({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when session mode is not subscription", async () => {
    mockUser();
    mocks.resolveBillingRole.mockResolvedValue("reader");
    mocks.getCheckoutSessionWithLineItems.mockResolvedValue({
      mode: "payment",
      metadata: { user_id: "user-1" },
    });
    const res = await POST(makePostReq({ session_id: "cs_test" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when session user_id does not match", async () => {
    mockUser();
    mocks.resolveBillingRole.mockResolvedValue("reader");
    mocks.getCheckoutSessionWithLineItems.mockResolvedValue({
      mode: "subscription",
      metadata: { user_id: "other-user" },
      line_items: { data: [] },
    });
    const res = await POST(makePostReq({ session_id: "cs_test" }));
    expect(res.status).toBe(403);
  });

  it("syncs billing on valid session", async () => {
    mockUser();
    mocks.resolveBillingRole.mockResolvedValue("reader");
    mocks.getCheckoutSessionWithLineItems.mockResolvedValue({
      mode: "subscription",
      metadata: { user_id: "user-1" },
      subscription: "sub_123",
      customer: "cus_123",
      payment_status: "paid",
      line_items: { data: [{ price: { id: "price_plus" } }] },
    });
    mocks.resolveRolePlanFromPriceIds.mockResolvedValue({ role: "reader", planKey: "plus" });
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({ row: null, error: null });
    mocks.planToPersist.mockReturnValue("plus");
    mocks.upsertBillingAccount.mockResolvedValue({ error: null });

    const res = await POST(makePostReq({ session_id: "cs_test" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mocks.upsertBillingAccount).toHaveBeenCalled();
  });
});

describe("GET /api/billing/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({});
  });

  it("returns 401 when not authenticated", async () => {
    mockNoUser();
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
  });

  it("defaults to reader when no author-role claim present", async () => {
    // Previously returned 403; the route now resolves to reader by default
    // and proceeds to the billing lookup (which returns 400 without a row).
    mockUser();
    mocks.resolveBillingRole.mockResolvedValue("reader");
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({ row: null, error: null });
    mocks.listStripeCustomersByEmail.mockResolvedValue([]);
    const res = await GET(makeGetReq());
    expect(res.status).toBe(400);
  });

  it("returns 400 when no billing row or customer found", async () => {
    mockUser();
    mocks.resolveBillingRole.mockResolvedValue("reader");
    mocks.getBillingAccountByUserIdAndRole.mockResolvedValue({ row: null, error: null });
    mocks.listStripeCustomersByEmail.mockResolvedValue([]);

    const res = await GET(makeGetReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("no_billing_row_or_customer");
  });
});
