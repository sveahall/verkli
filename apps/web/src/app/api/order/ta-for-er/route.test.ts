import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One endpoint, two products at different prices. The thing that must never
 * be true is that the browser gets a say in which price is charged.
 */

const mocks = vi.hoisted(() => ({
  createBookOrderCheckoutSession: vi.fn(),
  isStripeConfigured: vi.fn(() => true),
  rateLimitCheck: vi.fn(),
}));

vi.mock("@/lib/payments/stripe", () => ({
  createBookOrderCheckoutSession: mocks.createBookOrderCheckoutSession,
  isStripeConfigured: mocks.isStripeConfigured,
}));

vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({
    check: (...args: unknown[]) => mocks.rateLimitCheck(...args),
  }),
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    getRedisUrl: () => null,
    getRedisConnectionOptions: () => undefined,
    getRedisClientOptions: () => undefined,
  };
});

const { POST } = await import("./route");

const ADDRESS = {
  name: "Anna Andersson",
  line1: "Testgatan 1",
  postalCode: "12345",
  city: "Stockholm",
};

function makeRequest(payload: unknown) {
  return new Request("http://localhost/api/order/ta-for-er", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** The arguments the route handed to Stripe. */
function sessionArgs() {
  return mocks.createBookOrderCheckoutSession.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isStripeConfigured.mockReturnValue(true);
  mocks.rateLimitCheck.mockResolvedValue({ allowed: true });
  mocks.createBookOrderCheckoutSession.mockResolvedValue({
    url: "https://checkout.stripe.com/c/pay/cs_test_x",
  });
});

describe("POST /api/order/ta-for-er", () => {
  it("charges 75 kr for the download and sends no address to Stripe", async () => {
    const res = await POST(makeRequest({ variant: "ebook", email: "buyer@example.com" }));

    expect(res.status).toBe(200);
    const args = sessionArgs();
    expect(args.amountMinor).toBe(7500);
    expect(args.orderVariant).toBe("ebook");
    // Empty ship_* metadata would put a blank address on the Stripe dashboard
    // next to real ones that need posting.
    expect(args.shipping).toBeUndefined();
  });

  it("charges 249 kr for the printed copy and passes the address", async () => {
    const res = await POST(
      makeRequest({ variant: "print", email: "buyer@example.com", ...ADDRESS })
    );

    expect(res.status).toBe(200);
    const args = sessionArgs();
    expect(args.amountMinor).toBe(24900);
    expect(args.orderVariant).toBe("print");
    expect(args.shipping).toMatchObject({ line1: "Testgatan 1", city: "Stockholm", country: "SE" });
  });

  it("treats a missing variant as the printed copy", async () => {
    // An older client that does not know about the download must keep working
    // exactly as it did, rather than silently start selling a 75 kr product.
    const res = await POST(makeRequest({ email: "buyer@example.com", ...ADDRESS }));

    expect(res.status).toBe(200);
    expect(sessionArgs().amountMinor).toBe(24900);
  });

  it("ignores a price sent by the browser", async () => {
    // The client picks a product, never an amount.
    await POST(
      makeRequest({
        variant: "ebook",
        email: "buyer@example.com",
        amountMinor: 1,
        priceMinor: 1,
        price: 1,
      })
    );

    expect(sessionArgs().amountMinor).toBe(7500);
  });

  it("requires an address for the printed copy", async () => {
    const res = await POST(makeRequest({ variant: "print", email: "buyer@example.com" }));

    expect(res.status).toBe(400);
    expect(mocks.createBookOrderCheckoutSession).not.toHaveBeenCalled();
  });

  it("does not ask a download buyer for their home address", async () => {
    const res = await POST(makeRequest({ variant: "ebook", email: "buyer@example.com" }));

    expect(res.status).toBe(200);
  });

  it("rejects an unusable email for either variant", async () => {
    for (const payload of [
      { variant: "ebook", email: "not-an-email" },
      { variant: "print", email: "not-an-email", ...ADDRESS },
    ]) {
      const res = await POST(makeRequest(payload));
      expect(res.status).toBe(400);
    }
    expect(mocks.createBookOrderCheckoutSession).not.toHaveBeenCalled();
  });

  it("does not reach Stripe when rate limited", async () => {
    mocks.rateLimitCheck.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });

    const res = await POST(makeRequest({ variant: "ebook", email: "buyer@example.com" }));

    expect(res.status).toBe(429);
    expect(mocks.createBookOrderCheckoutSession).not.toHaveBeenCalled();
  });

  it("answers 503 rather than 500 when Stripe is not configured", async () => {
    mocks.isStripeConfigured.mockReturnValue(false);

    const res = await POST(makeRequest({ variant: "ebook", email: "buyer@example.com" }));

    expect(res.status).toBe(503);
  });
});
