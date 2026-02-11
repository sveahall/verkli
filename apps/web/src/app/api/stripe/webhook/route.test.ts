import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_ROUTES } from "@/lib/api-routes";

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

type OrderState = {
  id: string;
  user_id: string;
  book_id: string;
  status: "pending" | "paid" | "failed";
  stripe_session_id: string;
};

type PaymentRecordState = {
  id: string;
  user_id: string;
  status: "pending" | "paid" | "failed";
  stripe_session_id: string;
  credits_delta?: number;
  credits_applied_at?: string | null;
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

function makeAdminClient(input?: {
  order?: OrderState | null;
  donation?: PaymentRecordState | null;
  creditTopup?: PaymentRecordState | null;
}) {
  const state = {
    order: input?.order ?? null,
    donation: input?.donation ?? null,
    creditTopup: input?.creditTopup ?? null,
    seenEvents: new Set<string>(),
    stripeEventInserts: [] as Record<string, unknown>[],
    stripeEventRollbacks: [] as string[],
    creditGrantKeys: new Set<string>(),
    creditGrantCalls: [] as Record<string, unknown>[],
    orderUpdates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
    entitlementUpserts: [] as Record<string, unknown>[],
    donationUpdates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
    creditTopupUpdates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
  };

  const nowIso = () => new Date().toISOString();

  const client = {
    from: vi.fn((table: string) => {
      if (table === "stripe_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            state.stripeEventInserts.push(payload);
            const eventId = String(payload.stripe_event_id ?? "");
            if (state.seenEvents.has(eventId)) {
              return {
                error: {
                  code: "23505",
                  message: "duplicate key value violates unique constraint",
                },
              };
            }
            state.seenEvents.add(eventId);
            return { error: null };
          }),
          delete: vi.fn(() => ({
            eq: vi.fn(async (column: string, value: string) => {
              if (column !== "stripe_event_id") {
                throw new Error(`Unexpected stripe_events.delete eq column: ${column}`);
              }
              state.stripeEventRollbacks.push(value);
              state.seenEvents.delete(value);
              return { error: null };
            }),
          })),
        };
      }

      throw new Error(`Unexpected admin table ${table}`);
    }),
    rpc: vi.fn(async (fnName: string, args: { p_stripe_session_id?: string }) => {
      const sessionId = String(args.p_stripe_session_id ?? "");

      if (fnName === "finalize_order_checkout_session") {
        if (!state.order || state.order.stripe_session_id !== sessionId) {
          return { data: false, error: null };
        }

        if (state.order.status !== "paid") {
          state.orderUpdates.push({
            id: state.order.id,
            payload: { status: "paid" },
          });
          state.order = { ...state.order, status: "paid" };
        }

        state.entitlementUpserts.push({
          user_id: state.order.user_id,
          book_id: state.order.book_id,
          source: "purchase",
        });

        return { data: true, error: null };
      }

      if (fnName === "finalize_donation_checkout_session") {
        if (!state.donation || state.donation.stripe_session_id !== sessionId) {
          return { data: false, error: null };
        }

        state.donationUpdates.push({
          id: state.donation.id,
          payload: {
            status: "paid",
            paid_at: nowIso(),
          },
        });
        state.donation = {
          ...state.donation,
          status: "paid",
        };

        const creditsDelta = Math.max(0, Math.trunc(state.donation.credits_delta ?? 0));
        if (creditsDelta > 0 && !state.donation.credits_applied_at) {
          const key = `donation:${state.donation.id}`;
          if (!state.creditGrantKeys.has(key)) {
            state.creditGrantKeys.add(key);
            state.creditGrantCalls.push({
              p_user_id: state.donation.user_id,
              p_delta: creditsDelta,
              p_source: "donation",
              p_source_id: state.donation.id,
            });
          }

          state.donation.credits_applied_at = nowIso();
          state.donationUpdates.push({
            id: state.donation.id,
            payload: {
              credits_applied_at: state.donation.credits_applied_at,
            },
          });
        }

        return { data: true, error: null };
      }

      if (fnName === "finalize_credit_topup_checkout_session") {
        if (!state.creditTopup || state.creditTopup.stripe_session_id !== sessionId) {
          return { data: false, error: null };
        }

        state.creditTopupUpdates.push({
          id: state.creditTopup.id,
          payload: {
            status: "paid",
            paid_at: nowIso(),
          },
        });
        state.creditTopup = {
          ...state.creditTopup,
          status: "paid",
        };

        const creditsDelta = Math.max(0, Math.trunc(state.creditTopup.credits_delta ?? 0));
        if (creditsDelta > 0 && !state.creditTopup.credits_applied_at) {
          const key = `credit_topup:${state.creditTopup.id}`;
          if (!state.creditGrantKeys.has(key)) {
            state.creditGrantKeys.add(key);
            state.creditGrantCalls.push({
              p_user_id: state.creditTopup.user_id,
              p_delta: creditsDelta,
              p_source: "credit_topup",
              p_source_id: state.creditTopup.id,
            });
          }

          state.creditTopup.credits_applied_at = nowIso();
          state.creditTopupUpdates.push({
            id: state.creditTopup.id,
            payload: {
              credits_applied_at: state.creditTopup.credits_applied_at,
            },
          });
        }

        return { data: true, error: null };
      }

      throw new Error(`Unexpected rpc function ${fnName}`);
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

  return new Request(`http://localhost${API_ROUTES.stripeWebhook}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body,
  });
}

describe(`POST ${API_ROUTES.stripeWebhook}`, () => {
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
      order: {
        id: "order-1",
        user_id: "reader-1",
        book_id: "book-1",
        status: "pending",
        stripe_session_id: "cs_test_1",
      },
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

  it("marks donation records as paid for payment_type=donation", async () => {
    const admin = makeAdminClient({
      donation: {
        id: "donation-1",
        user_id: "reader-1",
        status: "pending",
        stripe_session_id: "cs_donate_1",
        credits_delta: 0,
      },
    });
    mocks.createAdminClient.mockReturnValue(admin.client);

    const payload = {
      id: "evt_donation",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_donate_1",
          payment_status: "paid",
          metadata: {
            payment_type: "donation",
          },
        },
      },
    };

    const res = await POST(makeSignedRequest(payload, webhookSecret));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ received: true, processed: true }));
    expect(admin.state.donation?.status).toBe("paid");
    expect(admin.state.donationUpdates.length).toBeGreaterThanOrEqual(1);
    expect(admin.state.creditGrantCalls).toHaveLength(0);
    expect(admin.state.creditTopupUpdates).toHaveLength(0);
    expect(admin.state.orderUpdates).toHaveLength(0);
    expect(admin.state.entitlementUpserts).toHaveLength(0);
  });

  it("credits topup exactly once even if webhook is replayed with a new event id", async () => {
    const admin = makeAdminClient({
      creditTopup: {
        id: "credit-topup-1",
        user_id: "reader-1",
        status: "pending",
        stripe_session_id: "cs_topup_1",
        credits_delta: 250,
        credits_applied_at: null,
      },
    });
    mocks.createAdminClient.mockReturnValue(admin.client);

    const payloadA = {
      id: "evt_credit_topup_a",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_topup_1",
          payment_status: "paid",
          metadata: {
            payment_type: "credit_topup",
          },
        },
      },
    };

    const payloadB = {
      ...payloadA,
      id: "evt_credit_topup_b",
    };

    const first = await POST(makeSignedRequest(payloadA, webhookSecret));
    const second = await POST(makeSignedRequest(payloadB, webhookSecret));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(admin.state.creditTopup?.status).toBe("paid");
    expect(admin.state.creditGrantCalls).toHaveLength(1);
    expect(admin.state.creditTopupUpdates.length).toBeGreaterThanOrEqual(1);
  });

  it("sets plan null and status canceled on customer.subscription.deleted", async () => {
    const admin = makeAdminClient();
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
