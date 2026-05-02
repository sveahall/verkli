import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  E_UNAUTHORIZED,
  E_INVALID_DONATION_AMOUNT,
  E_DONATION_CHECKOUT_FAILED,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  createDonationCheckoutSession: vi.fn(),
  getStripeCheckoutSession: vi.fn(),
  rateLimitCheck: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/payments/stripe", () => ({
  createDonationCheckoutSession: mocks.createDonationCheckoutSession,
  getStripeCheckoutSession: mocks.getStripeCheckoutSession,
}));
vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({
    check: (...args: unknown[]) => mocks.rateLimitCheck(...args),
  }),
}));

// Force in-memory rate limiter (no Redis)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

const { POST } = await import("./route");

function makeRequest(payload: unknown) {
  return new Request("http://localhost/api/donations/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function mockAuthedUser() {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: "user-1", email: "donor@example.com" } },
        }),
    },
  });
}

function mockNoUser() {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
    },
  });
}

function mockAdminClient({
  existingPending = false,
  insertOk = true,
}: {
  existingPending?: boolean;
  insertOk?: boolean;
} = {}) {
  const updateEq2 = vi.fn().mockResolvedValue({ error: null });
  const updateEq1 = vi.fn(() => ({ eq: updateEq2 }));
  const updateEq0 = vi.fn(() => ({ eq: updateEq1 }));

  const insertSingle = vi.fn().mockResolvedValue(
    insertOk
      ? { data: { id: "donation-1" }, error: null }
      : { data: null, error: { code: "23505", message: "insert failed" } },
  );
  const insertSelect = vi.fn(() => ({ single: insertSingle }));

  // Reuse-session lookup chain
  const reuseMaybeSingle = vi.fn().mockResolvedValue({
    data: existingPending
      ? { id: "donation-old", stripe_session_id: "cs_old" }
      : null,
    error: null,
  });
  const reuseLimit = vi.fn(() => ({ maybeSingle: reuseMaybeSingle }));
  const reuseOrder = vi.fn(() => ({ limit: reuseLimit }));
  const reuseGte = vi.fn(() => ({ order: reuseOrder }));
  const reuseNot = vi.fn(() => ({ gte: reuseGte }));
  const reuseEq4 = vi.fn(() => ({ not: reuseNot }));
  const reuseEq3 = vi.fn(() => ({ eq: reuseEq4 }));
  const reuseEq2 = vi.fn(() => ({ eq: reuseEq3 }));
  const reuseEq1 = vi.fn(() => ({ eq: reuseEq2 }));
  const reuseSelect = vi.fn(() => ({ eq: reuseEq1 }));

  const from = vi.fn(() => ({
    select: () => reuseSelect(),
    insert: vi.fn(() => ({ select: insertSelect })),
    update: vi.fn(() => ({ eq: updateEq0 })),
  }));

  mocks.createAdminClient.mockReturnValue({ from });
  return { from };
}

describe("POST /api/donations/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DONATION_CHECKOUT_MOCK_MODE;
    mocks.rateLimitCheck.mockResolvedValue({ allowed: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoUser();
    const res = await POST(makeRequest({ amountMinor: 5000 }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe(E_UNAUTHORIZED);
  });

  it("returns 429 when rate limited", async () => {
    mockAuthedUser();
    mocks.rateLimitCheck.mockResolvedValue({ allowed: false });

    const res = await POST(makeRequest({ amountMinor: 5000 }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe(E_RATE_LIMIT_EXCEEDED);
  });

  it("returns 400 for zero amount", async () => {
    mockAuthedUser();
    const res = await POST(makeRequest({ amountMinor: 0 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_INVALID_DONATION_AMOUNT);
  });

  it("returns 400 for negative amount", async () => {
    mockAuthedUser();
    const res = await POST(makeRequest({ amountMinor: -100 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_INVALID_DONATION_AMOUNT);
  });

  it("returns 400 for non-numeric amount", async () => {
    mockAuthedUser();
    const res = await POST(makeRequest({ amountMinor: "abc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_INVALID_DONATION_AMOUNT);
  });

  it("returns 400 when amount is missing entirely", async () => {
    mockAuthedUser();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_INVALID_DONATION_AMOUNT);
  });

  it("returns 200 with Stripe checkout url on valid request", async () => {
    mockAuthedUser();
    mockAdminClient();
    mocks.createDonationCheckoutSession.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/cs_test_123",
    });

    const res = await POST(makeRequest({ amountMinor: 5000, creditsDelta: 50 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("stripe.com");
    expect(body.donationId).toBe("donation-1");
  });

  it("passes correct parameters to Stripe checkout", async () => {
    mockAuthedUser();
    mockAdminClient();
    mocks.createDonationCheckoutSession.mockResolvedValue({
      id: "cs_test_456",
      url: "https://checkout.stripe.com/cs_test_456",
    });

    await POST(makeRequest({ amountMinor: 10000, creditsDelta: 100, currency: "usd" }));

    expect(mocks.createDonationCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 10000,
        currency: "USD",
        userId: "user-1",
        donationId: "donation-1",
        creditsDelta: 100,
        customerEmail: "donor@example.com",
      }),
    );
  });

  it("defaults currency to SEK when not provided", async () => {
    mockAuthedUser();
    mockAdminClient();
    mocks.createDonationCheckoutSession.mockResolvedValue({
      id: "cs_test_789",
      url: "https://checkout.stripe.com/cs_test_789",
    });

    await POST(makeRequest({ amountMinor: 5000 }));

    expect(mocks.createDonationCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "SEK" }),
    );
  });

  it("returns 500 when donation insert fails", async () => {
    mockAuthedUser();
    mockAdminClient({ insertOk: false });

    const res = await POST(makeRequest({ amountMinor: 5000 }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(E_DONATION_CHECKOUT_FAILED);
  });

  it("returns 500 and marks donation failed when Stripe errors", async () => {
    mockAuthedUser();
    mockAdminClient();
    mocks.createDonationCheckoutSession.mockRejectedValue(
      new Error("Stripe API down"),
    );

    const res = await POST(makeRequest({ amountMinor: 5000 }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(E_DONATION_CHECKOUT_FAILED);
  });

  it("reuses an existing open Stripe session", async () => {
    mockAuthedUser();
    mockAdminClient({ existingPending: true });
    mocks.getStripeCheckoutSession.mockResolvedValue({
      status: "open",
      url: "https://checkout.stripe.com/cs_old",
    });

    const res = await POST(makeRequest({ amountMinor: 5000 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://checkout.stripe.com/cs_old");
    expect(body.donationId).toBe("donation-old");
    // Should NOT create a new Stripe session
    expect(mocks.createDonationCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns mock URL when DONATION_CHECKOUT_MOCK_MODE is enabled", async () => {
    process.env.DONATION_CHECKOUT_MOCK_MODE = "true";

    const res = await POST(makeRequest({ amountMinor: 5000 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("mock=donation");
    expect(body.donationId).toBe("mock-donation");
  });

  it("returns 400 in mock mode for zero amount", async () => {
    process.env.DONATION_CHECKOUT_MOCK_MODE = "true";

    const res = await POST(makeRequest({ amountMinor: 0 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_INVALID_DONATION_AMOUNT);
  });
});
