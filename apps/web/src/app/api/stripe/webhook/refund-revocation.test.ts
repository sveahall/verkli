/**
 * Refunds and chargebacks must take the book back.
 *
 * `charge.refunded` and `charge.dispute.created` had no case in the dispatch
 * switch, so both fell to `default → { received: true, ignored: true }`: Stripe
 * got a 200, and the reader kept a book they had been paid back for. There is
 * no upstream allowlist, so the events were arriving — they were being
 * acknowledged and dropped.
 *
 * The revocation itself is one RPC (see
 * 20260907230000_refund_revokes_access.sql), because the entitlement delete and
 * the order status change must not be separable. These tests pin the handler's
 * decisions: which events revoke, which deliberately do not, and what happens
 * when the RPC fails.
 */

import { describe, expect, it, vi } from "vitest";
import { processStripeWebhookEvent } from "./stripeWebhook.handlers";

type RpcCall = { fn: string; args: Record<string, unknown> };

function makeAdmin(
  rpcResult: { data: unknown; error: { code?: string; message?: string } | null } = {
    data: true,
    error: null,
  }
) {
  const rpcCalls: RpcCall[] = [];
  const rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcResult);
  });

  return {
    admin: { rpc } as unknown as Parameters<typeof processStripeWebhookEvent>[0],
    rpcCalls,
  };
}

/** A fully-refunded Charge, as Stripe sends it. */
function fullRefund(overrides: Record<string, unknown> = {}) {
  return {
    id: "ch_test_1",
    payment_intent: "pi_test_1",
    amount: 24900,
    amount_refunded: 24900,
    refunded: true,
    ...overrides,
  } as unknown as Parameters<typeof processStripeWebhookEvent>[3];
}

describe("charge.refunded", () => {
  it("revokes access on a full refund", async () => {
    const { admin, rpcCalls } = makeAdmin();

    const result = await processStripeWebhookEvent(
      admin,
      "charge.refunded",
      "evt_refund_001",
      fullRefund()
    );

    expect(result).toEqual({ received: true, processed: true });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("revoke_order_for_refund");
    expect(rpcCalls[0].args).toEqual({
      p_payment_intent_id: "pi_test_1",
      p_kind: "refund",
    });
  });

  it("leaves access in place on a PARTIAL refund", async () => {
    // A goodwill refund of part of the price must not pull the book. Stripe
    // fires the same event type for both, which is why this is checked.
    const { admin, rpcCalls } = makeAdmin();

    const result = await processStripeWebhookEvent(
      admin,
      "charge.refunded",
      "evt_refund_partial",
      fullRefund({ amount: 24900, amount_refunded: 5000, refunded: false })
    );

    expect(result).toEqual({ received: true, processed: false });
    expect(rpcCalls).toHaveLength(0);
  });

  it("treats amount_refunded >= amount as full even without the refunded flag", async () => {
    // `refunded` is the primary signal; the comparison is the fallback for an
    // older API version that omits it.
    const { admin, rpcCalls } = makeAdmin();

    const result = await processStripeWebhookEvent(
      admin,
      "charge.refunded",
      "evt_refund_noflag",
      fullRefund({ refunded: undefined })
    );

    expect(result).toEqual({ received: true, processed: true });
    expect(rpcCalls).toHaveLength(1);
  });

  it("accepts an expanded payment_intent object, not just an id", async () => {
    const { admin, rpcCalls } = makeAdmin();

    await processStripeWebhookEvent(
      admin,
      "charge.refunded",
      "evt_refund_expanded",
      fullRefund({ payment_intent: { id: "pi_expanded_9" } })
    );

    expect(rpcCalls[0].args.p_payment_intent_id).toBe("pi_expanded_9");
  });
});

describe("charge.dispute.created", () => {
  it("revokes access, tagged as a dispute", async () => {
    // A chargeback takes the money whether we agree or not, so it revokes on
    // the same terms as a refund — and there is no partial-dispute exemption.
    const { admin, rpcCalls } = makeAdmin();

    const result = await processStripeWebhookEvent(
      admin,
      "charge.dispute.created",
      "evt_dispute_001",
      {
        id: "dp_test_1",
        charge: "ch_test_1",
        payment_intent: "pi_test_1",
        amount: 24900,
      } as unknown as Parameters<typeof processStripeWebhookEvent>[3]
    );

    expect(result).toEqual({ received: true, processed: true });
    expect(rpcCalls[0].args).toEqual({
      p_payment_intent_id: "pi_test_1",
      p_kind: "dispute",
    });
  });
});

describe("revocation edge cases", () => {
  it("does nothing when the event carries no payment_intent", async () => {
    // Nothing identifies the order, so there is nothing to revoke. It must not
    // guess, and must not throw — a 500 would make Stripe retry an event that
    // can never succeed.
    const { admin, rpcCalls } = makeAdmin();

    const result = await processStripeWebhookEvent(
      admin,
      "charge.refunded",
      "evt_refund_nopi",
      fullRefund({ payment_intent: undefined })
    );

    expect(result).toEqual({ received: true, processed: false });
    expect(rpcCalls).toHaveLength(0);
  });

  it("reports processed:false when the order is already refunded", async () => {
    // The RPC returns false for an unknown payment_intent and for one already
    // revoked — including the second of a dispute+refund pair on one charge.
    // Expected, not an error, so the audit row is written exactly once.
    const { admin, rpcCalls } = makeAdmin({ data: false, error: null });

    const result = await processStripeWebhookEvent(
      admin,
      "charge.refunded",
      "evt_refund_dup",
      fullRefund()
    );

    expect(result).toEqual({ received: true, processed: false });
    expect(rpcCalls).toHaveLength(1);
  });

  it("throws when the RPC fails, so Stripe retries", async () => {
    // Swallowing this would leave a refunded buyer with access and no second
    // attempt — indistinguishable from having no handler at all. The route
    // catches the throw, rolls back the idempotency row and returns 500.
    const { admin } = makeAdmin({
      data: null,
      error: { code: "57014", message: "statement timeout" },
    });

    await expect(
      processStripeWebhookEvent(admin, "charge.refunded", "evt_refund_boom", fullRefund())
    ).rejects.toThrow(/revoke_order_for_refund failed \(57014\)/);
  });
});
