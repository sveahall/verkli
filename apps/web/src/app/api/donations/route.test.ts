import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import {
  E_DONATION_CHECKOUT_FAILED,
  E_INVALID_DONATION_AMOUNT,
  E_UNAUTHORIZED,
} from "@/lib/api-errors";
import { API_ROUTES } from "@/lib/api-routes";

// Payment route contract tests for donation checkout.

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  createDonationCheckoutSession: vi.fn(),
  getStripeCheckoutSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/payments/stripe", () => ({
  createDonationCheckoutSession: mocks.createDonationCheckoutSession,
  getStripeCheckoutSession: mocks.getStripeCheckoutSession,
}));

const { POST } = await import("./checkout/route");

function makeSupabaseClient(userId: string | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: userId
            ? {
                id: userId,
                email: `${userId}@example.com`,
              }
            : null,
        },
      })),
    },
  };
}

function makeAdminClient(existingDonation: Record<string, unknown> | null = null) {
  const state = {
    existingDonation,
    insertedPayload: null as Record<string, unknown> | null,
    updatePayloads: [] as Record<string, unknown>[],
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table !== "donations") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn(() => {
          const chain: Record<string, unknown> = {};
          const self = () => chain;
          chain.eq = vi.fn(self);
          chain.not = vi.fn(self);
          chain.gte = vi.fn(self);
          chain.order = vi.fn(self);
          chain.limit = vi.fn(self);
          chain.maybeSingle = vi.fn(async () => ({ data: state.existingDonation, error: null }));
          return chain;
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          state.insertedPayload = payload;
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "donation-1" }, error: null })),
            })),
          };
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          state.updatePayloads.push(payload);
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
              })),
            })),
          };
        }),
      };
    }),
  };

  return { client, state };
}

function makeRequest(body: unknown): Request {
  return new Request(`http://localhost${API_ROUTES.donationsCheckout}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe(`POST ${API_ROUTES.donationsCheckout}`, () => {
  it("fails fast if route module file is missing", () => {
    expect(existsSync(new URL("./checkout/route.ts", import.meta.url))).toBe(true);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDonationCheckoutSession.mockResolvedValue({
      id: "cs_donate_1",
      url: "https://checkout.stripe.test/donate",
    });
    mocks.getStripeCheckoutSession.mockResolvedValue(null);
  });

  it("returns UNAUTHORIZED when user is missing", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient(null));
    mocks.createAdminClient.mockReturnValue(makeAdminClient().client);

    const res = await POST(makeRequest({ amountMinor: 500 }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe(E_UNAUTHORIZED);
  });

  it("returns INVALID_DONATION_AMOUNT for non-positive amount", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(makeAdminClient().client);

    const res = await POST(makeRequest({ amountMinor: 0 }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe(E_INVALID_DONATION_AMOUNT);
  });

  it("returns DONATION_CHECKOUT_FAILED when Stripe session creation fails", async () => {
    const admin = makeAdminClient();
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.createDonationCheckoutSession.mockRejectedValue(new Error("stripe down"));

    const res = await POST(makeRequest({ amountMinor: 500, currency: "sek" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(E_DONATION_CHECKOUT_FAILED);
    expect(admin.state.updatePayloads).toContainEqual({ status: "failed" });
  });

  it("creates donation row, persists stripe session id, and returns checkout URL", async () => {
    const admin = makeAdminClient();
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(admin.client);

    const res = await POST(makeRequest({ amountMinor: 1200, currency: "sek", creditsDelta: 25 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://checkout.stripe.test/donate");
    expect(body.donationId).toBe("donation-1");
    expect(admin.state.insertedPayload).toMatchObject({
      user_id: "reader-1",
      amount: 1200,
      currency: "SEK",
      status: "pending",
      credits_delta: 25,
    });
    expect(admin.state.updatePayloads).toContainEqual({ stripe_session_id: "cs_donate_1" });
    expect(mocks.createDonationCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 1200,
        currency: "SEK",
        donationId: "donation-1",
        creditsDelta: 25,
        userId: "reader-1",
        customerEmail: "reader-1@example.com",
        successUrl: expect.stringContaining("/donation/success"),
        cancelUrl: expect.stringContaining("/donation/cancel"),
      })
    );
  });

  it("returns mock checkout URL when donation mock mode is enabled and Stripe key is missing", async () => {
    const previousMockMode = process.env.DONATION_CHECKOUT_MOCK_MODE;
    const previousStripeSecret = process.env.STRIPE_SECRET_KEY;

    process.env.DONATION_CHECKOUT_MOCK_MODE = "true";
    delete process.env.STRIPE_SECRET_KEY;

    try {
      const res = await POST(makeRequest({ amountMinor: 500, currency: "sek" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.url).toContain("/donation/success?mock=donation");
      expect(body.donationId).toBe("mock-donation");
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.createDonationCheckoutSession).not.toHaveBeenCalled();
    } finally {
      if (previousMockMode === undefined) {
        delete process.env.DONATION_CHECKOUT_MOCK_MODE;
      } else {
        process.env.DONATION_CHECKOUT_MOCK_MODE = previousMockMode;
      }

      if (previousStripeSecret === undefined) {
        delete process.env.STRIPE_SECRET_KEY;
      } else {
        process.env.STRIPE_SECRET_KEY = previousStripeSecret;
      }
    }
  });

  it("returns mock checkout URL when donation mock mode is enabled even if Stripe key exists", async () => {
    const previousMockMode = process.env.DONATION_CHECKOUT_MOCK_MODE;
    const previousStripeSecret = process.env.STRIPE_SECRET_KEY;

    process.env.DONATION_CHECKOUT_MOCK_MODE = "true";
    process.env.STRIPE_SECRET_KEY = "sk_live_real_key_should_be_ignored";

    try {
      const res = await POST(makeRequest({ amountMinor: 500, currency: "sek" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.url).toContain("/donation/success?mock=donation");
      expect(body.donationId).toBe("mock-donation");
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.createDonationCheckoutSession).not.toHaveBeenCalled();
    } finally {
      if (previousMockMode === undefined) {
        delete process.env.DONATION_CHECKOUT_MOCK_MODE;
      } else {
        process.env.DONATION_CHECKOUT_MOCK_MODE = previousMockMode;
      }

      if (previousStripeSecret === undefined) {
        delete process.env.STRIPE_SECRET_KEY;
      } else {
        process.env.STRIPE_SECRET_KEY = previousStripeSecret;
      }
    }
  });

  it("reuses existing open checkout session for same pending donation intent", async () => {
    const admin = makeAdminClient({
      id: "donation-existing-1",
      stripe_session_id: "cs_existing_1",
    });
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.getStripeCheckoutSession.mockResolvedValue({
      id: "cs_existing_1",
      url: "https://checkout.stripe.test/existing-donation",
      status: "open",
    });

    const res = await POST(makeRequest({ amountMinor: 500, currency: "sek" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://checkout.stripe.test/existing-donation");
    expect(body.donationId).toBe("donation-existing-1");
    expect(admin.state.insertedPayload).toBeNull();
    expect(mocks.createDonationCheckoutSession).not.toHaveBeenCalled();
  });
});
