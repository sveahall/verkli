/**
 * Terminal events for delayed payment methods.
 *
 * Checkout no longer hardcodes `payment_method_types[0]=card` (see
 * `lib/payments/stripe.ts`), so Stripe's dynamic payment methods can now put a
 * delayed-notification method (Klarna, SEPA, Swish, …) in front of a buyer.
 * Such a session completes as `payment_status: "unpaid"` and then resolves later
 * through one of three events. `async_payment_succeeded` was already handled;
 * these tests cover the two terminal failures that previously fell through to
 * `default → ignored`, leaving the row `pending` forever.
 *
 * The critical assertion is the `status = "pending"` guard: a late or
 * out-of-order terminal event must never downgrade a row that already settled.
 */

import { describe, expect, it, vi } from "vitest";
import { processStripeWebhookEvent } from "./stripeWebhook.handlers";

type UpdateCall = {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<[string, unknown]>;
};

function makeAdmin(rowsAffected: number, error: { code?: string; message?: string } | null = null) {
  const calls: UpdateCall[] = [];

  const from = vi.fn((table: string) => ({
    update: (payload: Record<string, unknown>) => {
      const call: UpdateCall = { table, payload, filters: [] };
      calls.push(call);
      const chain = {
        eq: (column: string, value: unknown) => {
          call.filters.push([column, value]);
          return chain;
        },
        select: () =>
          Promise.resolve({
            data: error ? null : Array.from({ length: rowsAffected }, (_, i) => ({ id: `row-${i}` })),
            error,
          }),
      };
      return chain;
    },
  }));

  return {
    admin: { from } as unknown as Parameters<typeof processStripeWebhookEvent>[0],
    calls,
    from,
  };
}

function session(id: string, metadata: Record<string, string> = {}) {
  return { id, metadata } as unknown as Parameters<typeof processStripeWebhookEvent>[3];
}

describe("checkout.session.async_payment_failed / expired", () => {
  it("marks a pending book-purchase order failed", async () => {
    // A book purchase is the one kind that sets no payment_kind at all.
    const { admin, calls } = makeAdmin(1);

    const result = await processStripeWebhookEvent(
      admin,
      "checkout.session.async_payment_failed",
      "evt_async_fail_001",
      session("cs_test_book_1")
    );

    expect(result).toEqual({ received: true, processed: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("orders");
    expect(calls[0].payload).toEqual({ status: "failed" });
    expect(calls[0].filters).toEqual([
      ["stripe_session_id", "cs_test_book_1"],
      ["status", "pending"],
    ]);
  });

  it("routes an expired POD session to pod_orders", async () => {
    const { admin, calls } = makeAdmin(1);

    const result = await processStripeWebhookEvent(
      admin,
      "checkout.session.expired",
      "evt_expired_001",
      session("cs_test_pod_1", { payment_kind: "pod" })
    );

    expect(result).toEqual({ received: true, processed: true });
    expect(calls[0].table).toBe("pod_orders");
  });

  it.each([
    ["donation", "donations"],
    ["credit_topup", "credit_topups"],
  ])("routes a %s session to %s", async (paymentKind, table) => {
    const { admin, calls } = makeAdmin(1);

    await processStripeWebhookEvent(
      admin,
      "checkout.session.expired",
      `evt_expired_${paymentKind}`,
      session(`cs_test_${paymentKind}`, { payment_kind: paymentKind })
    );

    expect(calls[0].table).toBe(table);
  });

  it("never downgrades a row that already settled", async () => {
    // 0 rows affected == the guard matched nothing, i.e. the row is already paid.
    const { admin, calls } = makeAdmin(0);

    const result = await processStripeWebhookEvent(
      admin,
      "checkout.session.expired",
      "evt_expired_late",
      session("cs_test_already_paid")
    );

    expect(result).toEqual({ received: true, processed: false });
    // The pending guard must still have been applied — this is what makes the
    // late-event case safe rather than merely lucky.
    expect(calls[0].filters).toContainEqual(["status", "pending"]);
  });

  it("does not touch any table for kinds that have no pending row", async () => {
    // audiobook / translation / author_subscription claim their entitlement at
    // generate time via stripe_session_redemptions; an unpaid session never claims.
    for (const paymentKind of ["audiobook", "translation", "author_subscription"]) {
      const { admin, calls, from } = makeAdmin(1);

      const result = await processStripeWebhookEvent(
        admin,
        "checkout.session.async_payment_failed",
        `evt_async_fail_${paymentKind}`,
        session(`cs_test_${paymentKind}`, { payment_kind: paymentKind })
      );

      expect(result).toEqual({ received: true, processed: false });
      expect(from).not.toHaveBeenCalled();
      expect(calls).toHaveLength(0);
    }
  });

  it("throws on a DB error so the event row rolls back and Stripe retries", async () => {
    const { admin } = makeAdmin(0, { code: "57014", message: "statement timeout" });

    await expect(
      processStripeWebhookEvent(
        admin,
        "checkout.session.async_payment_failed",
        "evt_async_fail_dberr",
        session("cs_test_dberr")
      )
    ).rejects.toThrow(/failPendingCheckoutSession orders \(57014\)/);
  });

  it("ignores a session with no id", async () => {
    const { admin, from } = makeAdmin(1);

    const result = await processStripeWebhookEvent(
      admin,
      "checkout.session.expired",
      "evt_expired_noid",
      session("")
    );

    expect(result).toEqual({ received: true, processed: false });
    expect(from).not.toHaveBeenCalled();
  });
});
