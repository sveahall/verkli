/**
 * Keeps HANDLED_STRIPE_EVENTS and the dispatch switch from drifting apart.
 *
 * The list is what `npm run check:stripe-webhook` compares against the live
 * endpoint's subscription. If the list says an event is handled and the switch
 * has no case for it, the script reports the subscription as correct while the
 * event falls to `default → { received: true, ignored: true }` — acknowledged
 * with a 200 and dropped. That is exactly how `charge.refunded` went unnoticed:
 * every layer agreed, and none of them was checking the one that mattered.
 *
 * Asserted by reading the source rather than by dispatching each event,
 * because dispatching requires a plausible object per event type and a mock
 * per code path — which means the test would be exercising the mocks, not the
 * wiring. Same approach as schema-conformance.test.ts.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HANDLED_STRIPE_EVENTS } from "./stripeWebhook.events";

const SOURCE = readFileSync(join(__dirname, "stripeWebhook.handlers.ts"), "utf8");

/** `case "x":` lines inside the dispatch switch. */
function switchCases(): Set<string> {
  const found = new Set<string>();
  for (const match of SOURCE.matchAll(/^\s*case\s+"([a-z_.]+)":/gm)) {
    found.add(match[1]);
  }
  return found;
}

describe("HANDLED_STRIPE_EVENTS", () => {
  it("has a switch case for every event it claims to handle", () => {
    const cases = switchCases();
    const claimedButUnhandled = HANDLED_STRIPE_EVENTS.filter((e) => !cases.has(e));
    expect(claimedButUnhandled).toEqual([]);
  });

  it("claims every event the switch handles", () => {
    // The other direction. An event with a case but missing from the list is
    // one the check script will not ask Stripe about, so the handler can sit
    // unsubscribed and dead without anything noticing.
    const claimed = new Set<string>(HANDLED_STRIPE_EVENTS);
    const handledButUnclaimed = [...switchCases()].filter((e) => !claimed.has(e));
    expect(handledButUnclaimed).toEqual([]);
  });

  it("lists no duplicates", () => {
    expect(new Set(HANDLED_STRIPE_EVENTS).size).toBe(HANDLED_STRIPE_EVENTS.length);
  });

  it("includes the two revocation events", () => {
    // Named explicitly: these are the ones whose absence let a refunded reader
    // keep the book, and the pair most likely to be dropped again in a
    // refactor since neither is on the happy path.
    expect(HANDLED_STRIPE_EVENTS).toContain("charge.refunded");
    expect(HANDLED_STRIPE_EVENTS).toContain("charge.dispute.created");
  });
});
