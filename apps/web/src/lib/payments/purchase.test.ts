import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getStripeCheckoutSession: vi.fn(),
  logAnalyticsEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/payments/stripe", () => ({
  getStripeCheckoutSession: mocks.getStripeCheckoutSession,
}));

vi.mock("@/lib/analytics/events", () => ({
  logAnalyticsEvent: mocks.logAnalyticsEvent,
}));

const { confirmStripeBookPurchase } = await import("./purchase");

type OrderRow = {
  id: string;
  user_id: string;
  book_id: string;
  chapter_id: string | null;
  status: "pending" | "paid" | "failed";
  amount: number;
  currency: string;
};

function makeOrderSelectResult(order: OrderRow | null) {
  return {
    data: order,
    error: null,
  };
}

function makeAdminClient(order: OrderRow | null, finalizeResult = true) {
  const state = {
    orderUpdatePayloads: [] as Record<string, unknown>[],
    rpcCalls: [] as Array<{ fnName: string; args: Record<string, unknown> }>,
  };

  const updateChain = {
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
    })),
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table !== "orders") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => makeOrderSelectResult(order)),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          state.orderUpdatePayloads.push(payload);
          return updateChain;
        }),
      };
    }),
    rpc: vi.fn(async (fnName: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fnName, args });
      return { data: finalizeResult, error: null };
    }),
  };

  return { client, state };
}

describe("confirmStripeBookPurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logAnalyticsEvent.mockResolvedValue(undefined);
  });

  it("uses the atomic checkout finalizer for a valid paid session", async () => {
    const admin = makeAdminClient({
      id: "order-1",
      user_id: "reader-1",
      book_id: "book-1",
      chapter_id: "chapter-1",
      status: "pending",
      amount: 1299,
      currency: "SEK",
    });
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.getStripeCheckoutSession.mockResolvedValue({
      id: "cs_123",
      payment_status: "paid",
      metadata: {
        order_id: "order-1",
        user_id: "reader-1",
        book_id: "book-1",
      },
    });

    const ok = await confirmStripeBookPurchase({
      orderId: "order-1",
      sessionId: "cs_123",
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(ok).toBe(true);
    expect(admin.state.rpcCalls).toEqual([
      {
        fnName: "finalize_order_checkout_session",
        args: { p_stripe_session_id: "cs_123" },
      },
    ]);
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith(
      admin.client,
      expect.objectContaining({
        eventType: "purchase_completed",
        userId: "reader-1",
        bookId: "book-1",
        props: expect.objectContaining({ chapterId: "chapter-1" }),
      }),
    );
  });

  it("marks the order failed when the Stripe session metadata does not match", async () => {
    const admin = makeAdminClient({
      id: "order-1",
      user_id: "reader-1",
      book_id: "book-1",
      chapter_id: null,
      status: "pending",
      amount: 1299,
      currency: "SEK",
    });
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.getStripeCheckoutSession.mockResolvedValue({
      id: "cs_bad",
      payment_status: "paid",
      metadata: {
        order_id: "order-2",
        user_id: "reader-1",
        book_id: "book-1",
      },
    });

    const ok = await confirmStripeBookPurchase({
      orderId: "order-1",
      sessionId: "cs_bad",
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(ok).toBe(false);
    expect(admin.state.orderUpdatePayloads).toContainEqual({ status: "failed" });
    expect(admin.state.rpcCalls).toHaveLength(0);
    expect(mocks.logAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("does not emit duplicate analytics for an already-paid order", async () => {
    const admin = makeAdminClient({
      id: "order-1",
      user_id: "reader-1",
      book_id: "book-1",
      chapter_id: null,
      status: "paid",
      amount: 1299,
      currency: "SEK",
    });
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.getStripeCheckoutSession.mockResolvedValue({
      id: "cs_123",
      payment_status: "paid",
      metadata: {
        order_id: "order-1",
        user_id: "reader-1",
        book_id: "book-1",
      },
    });

    const ok = await confirmStripeBookPurchase({
      orderId: "order-1",
      sessionId: "cs_123",
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(ok).toBe(true);
    expect(admin.state.rpcCalls).toHaveLength(1);
    expect(mocks.logAnalyticsEvent).not.toHaveBeenCalled();
  });
});
