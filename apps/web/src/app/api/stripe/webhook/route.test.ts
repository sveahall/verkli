import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

type BillingAccountRow = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
};

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getBillingAccountByStripeCustomerId: vi.fn(),
  getBillingAccountByStripeSubscriptionId: vi.fn(),
  upsertBillingAccount: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/billing/server", () => ({
  getBillingAccountByStripeCustomerId: mocks.getBillingAccountByStripeCustomerId,
  getBillingAccountByStripeSubscriptionId: mocks.getBillingAccountByStripeSubscriptionId,
  upsertBillingAccount: mocks.upsertBillingAccount,
}));

const { POST } = await import("./route");

const stripe = new Stripe("sk_test_local", { apiVersion: "2024-06-20" });

type OrderState = {
  id: string;
  user_id: string;
  book_id: string;
  status: "pending" | "paid" | "failed";
  stripe_session_id: string;
};

function makeAdminClient(order: OrderState | null) {
  const state = {
    order,
    seenEvents: new Set<string>(),
    stripeEventInserts: [] as Record<string, unknown>[],
    orderUpdates: [] as Array<{ id: string; payload: Record<string, unknown>; statuses: string[] }>,
    entitlementUpserts: [] as Record<string, unknown>[],
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === "stripe_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            state.stripeEventInserts.push(payload);
            const eventId = String(payload.stripe_event_id ?? "");
            if (state.seenEvents.has(eventId)) {
              return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
            state.seenEvents.add(eventId);
            return { error: null };
          }),
        };
      }

      if (table === "orders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: string) => ({
              maybeSingle: vi.fn(async () => {
                if (column !== "stripe_session_id") {
                  throw new Error(`Unexpected orders.select eq column: ${column}`);
                }
                if (!state.order || state.order.stripe_session_id !== value) {
                  return { data: null, error: null };
                }
                return { data: state.order, error: null };
              }),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn((column: string, value: string) => ({
              in: vi.fn(async (_statusColumn: string, statuses: string[]) => {
                if (column !== "id") {
                  throw new Error(`Unexpected orders.update eq column: ${column}`);
                }
                state.orderUpdates.push({ id: value, payload, statuses });
                if (state.order && state.order.id === value && statuses.includes(state.order.status)) {
                  state.order = {
                    ...state.order,
                    status: String(payload.status ?? state.order.status) as OrderState["status"],
                  };
                }
                return { error: null };
              }),
            })),
          })),
        };
      }

      if (table === "entitlements") {
        return {
          upsert: vi.fn(async (payload: Record<string, unknown>) => {
            state.entitlementUpserts.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected admin table ${table}`);
    }),
  };

  return { client, state };
}

function makeSignedRequest(payload: Record<string, unknown>, secret: string): Request {
  const body = JSON.stringify(payload);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret,
  });

  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body,
  });
}

describe("POST /api/stripe/webhook", () => {
  const webhookSecret = "whsec_test_123";
  const stripeSecret = "sk_test_123";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    process.env.STRIPE_SECRET_KEY = stripeSecret;
    process.env.PRICE_PLUS = "price_plus";
    process.env.PRICE_PRO = "price_pro";

    mocks.getBillingAccountByStripeCustomerId.mockResolvedValue({ row: null, error: null });
    mocks.getBillingAccountByStripeSubscriptionId.mockResolvedValue({ row: null, error: null });
    mocks.upsertBillingAccount.mockResolvedValue({ error: null });
  });

  it("is idempotent: duplicate stripe_event_id does not process event twice", async () => {
    const admin = makeAdminClient({
      id: "order-1",
      user_id: "reader-1",
      book_id: "book-1",
      status: "pending",
      stripe_session_id: "cs_test_1",
    });
    mocks.createAdminClient.mockReturnValue(admin.client);

    const payload = {
      id: "evt_same",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", payment_status: "paid" } },
    };

    const first = await POST(makeSignedRequest(payload, webhookSecret));
    const second = await POST(makeSignedRequest(payload, webhookSecret));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(admin.state.order?.status).toBe("paid");
    expect(admin.state.orderUpdates).toHaveLength(1);
    expect(admin.state.entitlementUpserts).toHaveLength(1);
    expect(admin.state.stripeEventInserts).toHaveLength(2);
  });

  it("sets plan null and status canceled on customer.subscription.deleted", async () => {
    const admin = makeAdminClient(null);
    mocks.createAdminClient.mockReturnValue(admin.client);

    const existing: BillingAccountRow = {
      user_id: "author-1",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      plan: "pro",
      status: "active",
      current_period_end: null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    };

    mocks.getBillingAccountByStripeSubscriptionId.mockResolvedValue({
      row: existing,
      error: null,
    });

    const payload = {
      id: "evt_sub_deleted",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "canceled",
          current_period_end: 1700000000,
          cancel_at_period_end: false,
          metadata: {},
        },
      },
    };

    const res = await POST(makeSignedRequest(payload, webhookSecret));

    expect(res.status).toBe(200);
    expect(mocks.upsertBillingAccount).toHaveBeenCalledTimes(1);
    expect(mocks.upsertBillingAccount).toHaveBeenCalledWith(
      admin.client,
      "author-1",
      expect.objectContaining({
        stripe_customer_id: "cus_123",
        stripe_subscription_id: null,
        plan: null,
        status: "canceled",
        cancel_at_period_end: false,
        current_period_end: new Date(1700000000 * 1000).toISOString(),
      })
    );
  });
});
