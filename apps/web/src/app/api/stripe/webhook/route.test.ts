import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

const { POST } = await import("./route");

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
    orderUpdates: [] as Array<{ id: string; payload: Record<string, unknown>; statuses: string[] }>,
    entitlementUpserts: [] as Record<string, unknown>[],
  };

  const client = {
    from: vi.fn((table: string) => {
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
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");

  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    body,
  });
}

describe("POST /api/stripe/webhook", () => {
  const webhookSecret = "whsec_test_123";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  });

  it("marks order paid and upserts entitlement on checkout.session.completed", async () => {
    const admin = makeAdminClient({
      id: "order-1",
      user_id: "reader-1",
      book_id: "book-1",
      status: "pending",
      stripe_session_id: "cs_test_1",
    });
    mocks.createAdminClient.mockReturnValue(admin.client);

    const req = makeSignedRequest(
      {
        id: "evt_1",
        type: "checkout.session.completed",
        data: { object: { id: "cs_test_1", payment_status: "paid" } },
      },
      webhookSecret
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ received: true, processed: true });
    expect(admin.state.order?.status).toBe("paid");
    expect(admin.state.entitlementUpserts).toHaveLength(1);
    expect(admin.state.entitlementUpserts[0]).toMatchObject({
      user_id: "reader-1",
      book_id: "book-1",
      source: "purchase",
    });
  });

  it("is idempotent for duplicate webhook deliveries on the same session", async () => {
    const admin = makeAdminClient({
      id: "order-1",
      user_id: "reader-1",
      book_id: "book-1",
      status: "pending",
      stripe_session_id: "cs_test_1",
    });
    mocks.createAdminClient.mockReturnValue(admin.client);

    const payload = {
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", payment_status: "paid" } },
    };

    const first = await POST(makeSignedRequest(payload, webhookSecret));
    const second = await POST(makeSignedRequest(payload, webhookSecret));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(admin.state.order?.status).toBe("paid");
    expect(admin.state.orderUpdates).toHaveLength(1);
    expect(admin.state.entitlementUpserts).toHaveLength(2);
  });
});
