/**
 * Sprint 0.5 Task 9 — Stripe webhook replay idempotency.
 *
 * The webhook is idempotent because of the `stripe_events` UNIQUE constraint
 * on `stripe_event_id`. The handler in stripeWebhook.handlers.ts encodes
 * this:
 *   - First INSERT succeeds → `recorded`
 *   - Replays hit unique-violation (SQL state 23505) → `duplicate`
 *
 * This test simulates 5 sequential replays of the same event id against a
 * faked admin client and asserts:
 *   1. Exactly one INSERT actually occurred.
 *   2. The first call returns `recorded`; the rest return `duplicate`.
 *   3. A non-23505 error still throws (so genuine failures aren't swallowed).
 */

import { describe, expect, it, vi } from "vitest";
import { recordStripeEvent } from "./stripeWebhook.handlers";

type InsertOutcome = { error: { code?: string; message?: string } | null };

function makeAdmin(seq: InsertOutcome[]) {
  let i = 0;
  const insert = vi.fn(() =>
    Promise.resolve(seq[i++] ?? { error: { code: "OOPS", message: "out of fixtures" } })
  );
  const from = vi.fn().mockReturnValue({ insert });
  return { from, _insert: insert, _from: from } as unknown as Parameters<
    typeof recordStripeEvent
  >[0] & { _insert: typeof insert; _from: typeof from };
}

describe("Stripe webhook idempotency on 5x replay", () => {
  it("INSERT happens once; subsequent replays return duplicate", async () => {
    const seq: InsertOutcome[] = [
      { error: null }, // first insert succeeds
      { error: { code: "23505", message: "duplicate key" } },
      { error: { code: "23505", message: "duplicate key" } },
      { error: { code: "23505", message: "duplicate key" } },
      { error: { code: "23505", message: "duplicate key" } },
    ];
    const admin = makeAdmin(seq);

    const eventId = "evt_test_redemption_001";
    const type = "checkout.session.completed";

    const results: Array<"recorded" | "duplicate"> = [];
    for (let n = 0; n < 5; n++) {
      results.push(await recordStripeEvent(admin, eventId, type));
    }

    expect(results).toEqual([
      "recorded",
      "duplicate",
      "duplicate",
      "duplicate",
      "duplicate",
    ]);
    expect(admin._from).toHaveBeenCalledTimes(5);
    expect(admin._insert).toHaveBeenCalledTimes(5);
    // Each replay still attempts to INSERT — Postgres rejects the dup. That's
    // the design: the unique index is the source of truth.
    for (let n = 0; n < 5; n++) {
      expect(admin._insert).toHaveBeenNthCalledWith(n + 1, {
        stripe_event_id: eventId,
        type,
      });
    }
  });

  it("non-unique-violation errors propagate (do not become 'duplicate')", async () => {
    const admin = makeAdmin([
      { error: { code: "08006", message: "connection failure" } },
    ]);

    await expect(
      recordStripeEvent(admin, "evt_failure_case", "checkout.session.completed")
    ).rejects.toThrow(/stripe_events insert failed.*08006.*connection failure/);
  });

  it("exactly one redemption / entitlement is created across 5 replays (idempotency contract)", async () => {
    // The handler funnels every event through recordStripeEvent first. For
    // duplicates, the route returns early with `{ duplicate: true }` and never
    // calls processStripeWebhookEvent. So the contract is:
    //   replays === 5  ⇒  recordStripeEvent INSERT attempts === 5 (4 dup),
    //   processStripeWebhookEvent calls === 1.
    //
    // We verify the recordStripeEvent half above; the route's branch logic
    // (`if (eventState === "duplicate") return early`) is what guarantees the
    // single processing call. That branch is exercised by route.test.ts.
    const seq: InsertOutcome[] = [
      { error: null },
      { error: { code: "23505" } },
      { error: { code: "23505" } },
      { error: { code: "23505" } },
      { error: { code: "23505" } },
    ];
    const admin = makeAdmin(seq);

    let recorded = 0;
    let duplicate = 0;
    for (let n = 0; n < 5; n++) {
      const state = await recordStripeEvent(
        admin,
        "evt_redemption_x",
        "checkout.session.completed"
      );
      if (state === "recorded") recorded += 1;
      else duplicate += 1;
    }

    expect(recorded).toBe(1);
    expect(duplicate).toBe(4);
  });
});
