import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveBillingState } from "@/lib/billing/state";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = initial;
    return [hooks.values[i], (value: unknown) => { hooks.values[i] = value; }];
  },
  useRef: (initial: unknown) => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = { current: initial };
    return hooks.values[i];
  },
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
}));
vi.mock("@/hooks/useDocumentVisible", () => ({ useDocumentVisible: () => true }));
import { useBillingState } from "./useBillingState";

function BillingStateHarness() { return useBillingState(); }
function render() { hooks.cursor = 0; return BillingStateHarness(); }
beforeEach(() => { hooks.values = []; hooks.cursor = 0; });
afterEach(() => vi.unstubAllGlobals());

describe("billing state refresh", () => {
  it("keeps beta access separate from actual Stripe state and clears a revoked grant", async () => {
    const payload = {
      ...deriveBillingState(null), plan: "pro", isProActive: true, isBetaProActive: true,
      status: "past_due", stripeCustomerId: "cus_real", stripeSubscriptionId: "sub_real",
      currentPeriodEnd: "2026-10-01T00:00:00Z", cancelAtPeriodEnd: true,
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json(payload))
      .mockResolvedValueOnce(Response.json(deriveBillingState(null))));
    await render().refetch();
    expect(render().state).toEqual(payload);
    await render().refetch();
    expect(render().state).toEqual(deriveBillingState(null));
  });

  it("clears beta access on a failed refresh", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ ...deriveBillingState(null), plan: "pro", isProActive: true, isBetaProActive: true }))
      .mockResolvedValueOnce(Response.json({ error: "GENERIC_ERROR" }, { status: 500 })));
    await render().refetch();
    expect(render().isProActive).toBe(true);
    await render().refetch();
    expect(render()).toMatchObject({ state: null, isProActive: false });
  });
});
