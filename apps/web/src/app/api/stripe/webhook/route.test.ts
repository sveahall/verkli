import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mockResolveRolePlanFromPriceIds = vi.fn();
const mockCreateAdminClient = vi.fn();
const mockGetBillingAccountByStripeSubscriptionId = vi.fn();
const mockGetBillingAccountByStripeCustomerId = vi.fn();
const mockUpsertBillingAccount = vi.fn();

vi.mock("@/lib/billing/catalog", () => ({
  resolveRolePlanFromPriceIds: (...args: unknown[]) =>
    mockResolveRolePlanFromPriceIds(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

vi.mock("@/lib/billing/server", () => ({
  getBillingAccountByStripeCustomerId: (...args: unknown[]) =>
    mockGetBillingAccountByStripeCustomerId(...args),
  getBillingAccountByStripeSubscriptionId: (...args: unknown[]) =>
    mockGetBillingAccountByStripeSubscriptionId(...args),
  upsertBillingAccount: (...args: unknown[]) => mockUpsertBillingAccount(...args),
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: (payload: string) => {
        if (!payload) throw new Error("bad");
        return {
          id: "evt_1",
          type: "customer.subscription.updated",
          data: {
            object: {
              id: "sub_1",
              customer: "cus_1",
              status: "active",
              current_period_end: 9999999999,
              cancel_at_period_end: false,
              metadata: { user_id: "user-1" },
              items: {
                data: [{ price: { id: "price_1Syup9AddvXwS9PwrM8vP9pu" } }],
              },
            },
          },
        };
      },
    },
  })),
}));

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockGetBillingAccountByStripeSubscriptionId.mockResolvedValue({ row: null, error: null });
    mockGetBillingAccountByStripeCustomerId.mockResolvedValue({ row: null, error: null });
    mockUpsertBillingAccount.mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        insert: () => Promise.resolve({ error: null }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
    });
  });

  it("persists plan from catalog when price id resolves to author pro", async () => {
    mockResolveRolePlanFromPriceIds.mockResolvedValue({ role: "author", planKey: "pro" });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: "{}",
        headers: { "stripe-signature": "t=0,v1=abc" },
      })
    );

    expect(res.status).toBe(200);
    expect(mockResolveRolePlanFromPriceIds).toHaveBeenCalled();
    expect(mockUpsertBillingAccount).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "author",
      expect.objectContaining({ plan: "pro" })
    );
  });

  it("returns 200 and does not crash when price ids do not resolve (unknown price id)", async () => {
    mockResolveRolePlanFromPriceIds.mockResolvedValue(null);

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: "{}",
        headers: { "stripe-signature": "t=0,v1=abc" },
      })
    );

    expect(res.status).toBe(200);
    expect(mockResolveRolePlanFromPriceIds).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[stripe.webhook] could not resolve role/plan from price ids, skipping billing update",
      expect.objectContaining({ eventId: "evt_1", priceIds: expect.any(Array) })
    );
    expect(mockUpsertBillingAccount).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
