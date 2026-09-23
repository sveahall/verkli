import { describe, it, expect, vi } from "vitest";
import { CREDIT_PRICING_CONFIRMED } from "@/lib/billing/credit-packs";

/**
 * The pricing gate, tested against the REAL flag.
 *
 * route.test.ts mocks `CREDIT_PRICING_CONFIRMED` to true so it can exercise the
 * route's behaviour. That mock would hide the gate itself, so it lives here in
 * its own file where the module is untouched.
 *
 * The prices in credit-packs.ts are placeholders. A comment saying so does not
 * stop a POST from charging someone; this does.
 */

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
  createPerUserRateLimiter: () => ({ check: () => ({ allowed: true }) }),
}));

const { POST } = await import("./route");

describe("credits/checkout pricing gate", () => {
  it("does not charge anyone while the pack prices are unconfirmed", async () => {
    // If this flag is true, the placeholder figures in credit-packs.ts have
    // been replaced with agreed prices — update this file when that happens.
    expect(CREDIT_PRICING_CONFIRMED).toBe(false);

    const res = await POST(
      new Request("http://localhost/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: "large" }),
      })
    );

    expect(res.status).toBe(404);
    expect(mocks.createCreditTopUpCheckoutSession).not.toHaveBeenCalled();
    // The gate runs before auth, so an unauthenticated probe cannot tell the
    // route apart from one that does not exist.
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
