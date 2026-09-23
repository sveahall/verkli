import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getStripeCheckoutSession: vi.fn(),
  logAnalyticsEvent: vi.fn(),
  claimPaidOrderForReceipt: vi.fn(),
  sendPurchaseReceipt: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/payments/purchase-receipt", () => ({
  claimPaidOrderForReceipt: mocks.claimPaidOrderForReceipt,
  sendPurchaseReceipt: mocks.sendPurchaseReceipt,
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
    // Default: this caller lost the claim race, so no receipt. Tests that
    // exercise the receipt opt in explicitly.
    mocks.claimPaidOrderForReceipt.mockResolvedValue(null);
    mocks.sendPurchaseReceipt.mockResolvedValue(undefined);
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

    expect(ok).toBe("paid");
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

    expect(ok).toBe("failed");
    expect(admin.state.orderUpdatePayloads).toContainEqual({ status: "failed" });
    expect(admin.state.rpcCalls).toHaveLength(0);
    expect(mocks.logAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("reports processing, and does NOT fail the order, for a settling delayed payment", async () => {
    // Klarna / SEPA / Swish complete Checkout with payment_status "unpaid" and
    // status "complete", then settle later via async_payment_succeeded. Marking
    // the order failed here would show the buyer "try again" and risk a double
    // charge, since they hold no entitlement yet to trip the 409 guard.
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
      id: "cs_klarna",
      payment_status: "unpaid",
      status: "complete",
      metadata: {
        order_id: "order-1",
        user_id: "reader-1",
        book_id: "book-1",
      },
    });

    const ok = await confirmStripeBookPurchase({
      orderId: "order-1",
      sessionId: "cs_klarna",
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(ok).toBe("processing");
    expect(admin.state.orderUpdatePayloads).toHaveLength(0);
    expect(admin.state.rpcCalls).toHaveLength(0);
    expect(mocks.logAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("still fails an abandoned session that was never completed", async () => {
    // status "open" means the buyer never paid at all — keep the fail-fast path.
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
      id: "cs_open",
      payment_status: "unpaid",
      status: "open",
      metadata: {
        order_id: "order-1",
        user_id: "reader-1",
        book_id: "book-1",
      },
    });

    const ok = await confirmStripeBookPurchase({
      orderId: "order-1",
      sessionId: "cs_open",
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(ok).toBe("failed");
    expect(admin.state.orderUpdatePayloads).toContainEqual({ status: "failed" });
    expect(admin.state.rpcCalls).toHaveLength(0);
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

    expect(ok).toBe("paid");
    expect(admin.state.rpcCalls).toHaveLength(1);
    expect(mocks.logAnalyticsEvent).not.toHaveBeenCalled();
  });

  describe("purchase receipt", () => {
    const paidSession = {
      id: "cs_123",
      payment_status: "paid",
      metadata: {
        order_id: "order-1",
        user_id: "reader-1",
        book_id: "book-1",
      },
    };

    const pendingOrder = {
      id: "order-1",
      user_id: "reader-1",
      book_id: "book-1",
      chapter_id: null,
      status: "pending" as const,
      amount: 1299,
      currency: "SEK",
    };

    const claim = {
      orderId: "order-1",
      userId: "reader-1",
      bookId: "book-1",
      chapterId: null,
      amountMinor: 1299,
      currency: "SEK",
      stripeSessionId: "cs_123",
      createdAt: "2026-08-18T10:00:00.000Z",
    };

    it("sends exactly one receipt when this caller wins the claim", async () => {
      const admin = makeAdminClient(pendingOrder);
      mocks.createAdminClient.mockReturnValue(admin.client);
      mocks.getStripeCheckoutSession.mockResolvedValue(paidSession);
      mocks.claimPaidOrderForReceipt.mockResolvedValue(claim);

      const ok = await confirmStripeBookPurchase({
        orderId: "order-1",
        sessionId: "cs_123",
        userId: "reader-1",
        bookId: "book-1",
      });

      expect(ok).toBe("paid");
      expect(mocks.claimPaidOrderForReceipt).toHaveBeenCalledWith(
        admin.client,
        "cs_123",
      );
      expect(mocks.sendPurchaseReceipt).toHaveBeenCalledTimes(1);
      expect(mocks.sendPurchaseReceipt).toHaveBeenCalledWith(admin.client, claim);
    });

    it("sends no receipt when the webhook already claimed the same session", async () => {
      // The success page re-runs on every reload and races the webhook. Losing
      // the claim is the signal that a receipt has already gone out.
      const admin = makeAdminClient({ ...pendingOrder, status: "paid" });
      mocks.createAdminClient.mockReturnValue(admin.client);
      mocks.getStripeCheckoutSession.mockResolvedValue(paidSession);
      mocks.claimPaidOrderForReceipt.mockResolvedValue(null);

      const ok = await confirmStripeBookPurchase({
        orderId: "order-1",
        sessionId: "cs_123",
        userId: "reader-1",
        bookId: "book-1",
      });

      expect(ok).toBe("paid");
      expect(mocks.sendPurchaseReceipt).not.toHaveBeenCalled();
    });

    it("sends no receipt on repeated confirmations of one purchase", async () => {
      const admin = makeAdminClient(pendingOrder);
      mocks.createAdminClient.mockReturnValue(admin.client);
      mocks.getStripeCheckoutSession.mockResolvedValue(paidSession);
      // First confirmation wins the claim; every later one loses it.
      mocks.claimPaidOrderForReceipt
        .mockResolvedValueOnce(claim)
        .mockResolvedValue(null);

      for (let i = 0; i < 4; i += 1) {
        await confirmStripeBookPurchase({
          orderId: "order-1",
          sessionId: "cs_123",
          userId: "reader-1",
          bookId: "book-1",
        });
      }

      expect(mocks.sendPurchaseReceipt).toHaveBeenCalledTimes(1);
    });

    it("sends no receipt for a settling delayed payment", async () => {
      // A `processing` purchase is neither paid nor failed. Emailing a receipt
      // for money that has not arrived would be a lie.
      const admin = makeAdminClient(pendingOrder);
      mocks.createAdminClient.mockReturnValue(admin.client);
      mocks.getStripeCheckoutSession.mockResolvedValue({
        id: "cs_klarna",
        payment_status: "unpaid",
        status: "complete",
        metadata: {
          order_id: "order-1",
          user_id: "reader-1",
          book_id: "book-1",
        },
      });

      const ok = await confirmStripeBookPurchase({
        orderId: "order-1",
        sessionId: "cs_klarna",
        userId: "reader-1",
        bookId: "book-1",
      });

      expect(ok).toBe("processing");
      expect(mocks.claimPaidOrderForReceipt).not.toHaveBeenCalled();
      expect(mocks.sendPurchaseReceipt).not.toHaveBeenCalled();
    });

    it("sends no receipt when the session metadata does not match the order", async () => {
      const admin = makeAdminClient(pendingOrder);
      mocks.createAdminClient.mockReturnValue(admin.client);
      mocks.getStripeCheckoutSession.mockResolvedValue({
        id: "cs_bad",
        payment_status: "paid",
        metadata: {
          order_id: "someone-elses-order",
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

      expect(ok).toBe("failed");
      expect(mocks.claimPaidOrderForReceipt).not.toHaveBeenCalled();
      expect(mocks.sendPurchaseReceipt).not.toHaveBeenCalled();
    });

    it("sends no receipt when the finalizer did not complete the purchase", async () => {
      // Access is what the receipt attests to. If the RPC failed there is no
      // entitlement yet, so the email would promise something untrue.
      const admin = makeAdminClient(pendingOrder, false);
      mocks.createAdminClient.mockReturnValue(admin.client);
      mocks.getStripeCheckoutSession.mockResolvedValue(paidSession);
      mocks.claimPaidOrderForReceipt.mockResolvedValue(claim);

      const ok = await confirmStripeBookPurchase({
        orderId: "order-1",
        sessionId: "cs_123",
        userId: "reader-1",
        bookId: "book-1",
      });

      expect(ok).toBe("failed");
      expect(mocks.sendPurchaseReceipt).not.toHaveBeenCalled();
    });
  });
});
