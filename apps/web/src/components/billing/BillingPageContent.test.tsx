import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveBillingState, type BillingState } from "@/lib/billing/state";

const hooks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[],
  billing: { state: null as BillingState | null, loading: false, error: null, refetch: vi.fn() },
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/hooks/useDocumentVisible", () => ({ useDocumentVisible: () => true }));
vi.mock("@/hooks/useBillingState", () => ({ useBillingState: () => hooks.billing }));
import { BillingPageContent } from "./BillingPageContent";

function render() {
  hooks.cursor = 0;
  hooks.effects = [];
  return renderToStaticMarkup(<BillingPageContent
    title="Subscription" subtitle="Manage Verkli Pro for authors."
    pastDueMessage="Update your subscription to reactivate Pro features."
    annualAvailable
    planCards={[{ id: "pro", name: "Verkli Pro", description: "For author workflows.", bullets: ["AI translation"] }]}
    initialBillingState={hooks.billing.state}
  />);
}

function renderMounted() {
  render();
  hooks.effects.forEach((effect) => effect());
  return render();
}

beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.effects = [];
  hooks.billing.state = deriveBillingState(null);
});

describe("billing beta presentation", () => {
  it("shows the free beta promise and generation limits without redundant checkout or portal actions", () => {
    hooks.billing.state = { ...deriveBillingState(null), plan: "pro", isProActive: true, isBetaProActive: true };
    const html = renderMounted();
    expect(html).toContain("Verkli Pro · Beta");
    expect(html).toContain("Included until public launch. No card required.");
    expect(html).toContain("Generation limits still apply.");
    expect(html).not.toContain("Start Pro");
    expect(html).not.toContain("Manage subscription");
    expect(html).not.toContain("Annual");
    expect(html).not.toContain("Period end:");
    expect(html).not.toContain("Sync subscription from Stripe");
  });

  it("retains genuine past-due details and management without claiming beta access has stopped", () => {
    hooks.billing.state = {
      ...deriveBillingState(null), plan: "pro", isProActive: true, isBetaProActive: true,
      status: "past_due", stripeCustomerId: "cus_real", stripeSubscriptionId: "sub_real",
      currentPeriodEnd: "2026-10-01T12:00:00Z", cancelAtPeriodEnd: true,
    };
    const html = renderMounted();
    expect(html).toContain("Verkli Pro · Beta");
    expect(html).toContain("Past due");
    expect(html).toContain("10/1/2026");
    expect(html).toContain("Subscription will end at the end of the billing period.");
    expect(html).toContain("Manage subscription");
    expect(html).toContain("Your paid subscription has an overdue payment.");
    expect(html).not.toContain("reactivate Pro features");
    expect(html).not.toContain("Start Pro");
  });

  it("keeps paid subscription details and controls unchanged", () => {
    hooks.billing.state = {
      ...deriveBillingState(null), plan: "pro", isProActive: true, status: "active",
      stripeCustomerId: "cus_real", stripeSubscriptionId: "sub_real",
      currentPeriodEnd: "2026-10-01T12:00:00Z", cancelAtPeriodEnd: true,
    };
    const html = renderMounted();
    expect(html).toContain("Active plan");
    expect(html).toContain("Manage subscription");
    expect(html).toContain("10/1/2026");
    expect(html).not.toContain("Beta");
    expect(html).not.toContain("No card required");
  });

  it("identifies historical subscription status and dates separately from beta access", () => {
    hooks.billing.state = {
      ...deriveBillingState(null), plan: "pro", isProActive: true, isBetaProActive: true,
      status: "canceled", stripeCustomerId: "cus_real", currentPeriodEnd: "2026-09-01T12:00:00Z",
    };
    const html = renderMounted();
    expect(html).toContain("Subscription status:");
    expect(html).toContain("Canceled");
    expect(html).toContain("Subscription period end:");
    expect(html).toContain("9/1/2026");
    expect(html).not.toContain("Manage subscription");
  });

  it("keeps the purchase action for an ordinary author", () => {
    const html = renderMounted();
    expect(html).toContain("Start Pro");
    expect(html).not.toContain("Verkli Pro · Beta");
  });
});
