import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { deriveBillingState, type BillingState } from "@/lib/billing/state";

vi.mock("@/components/books/JobStatusBanner", () => ({ BookJobsBanner: () => null }));
import { BookEditorStatusBanners } from "./BookEditorStatusBanners";

function render(state: BillingState) {
  const props = {
    jobLoading: false, jobError: null, jobsForBanner: [], onJobRetry: async () => {},
    billingPastDue: state.status === "past_due", billingProActive: state.isProActive,
  };
  return renderToStaticMarkup(<BookEditorStatusBanners {...props} />);
}

describe("editor billing access warning", () => {
  it("keeps the overdue payment warning without claiming eligible beta Pro is locked", () => {
    const state: BillingState = {
      ...deriveBillingState(null), plan: "pro", isProActive: true, isBetaProActive: true,
      status: "past_due", stripeCustomerId: "cus_real", stripeSubscriptionId: "sub_real",
    };
    const html = render(state);
    expect(html).toContain("past_due");
    expect(html).toContain("Your Pro access remains active.");
    expect(html).not.toContain("Billing features are locked until payment is updated");
    expect(html).toContain('href="/author/billing"');
    expect(html).toContain("Manage subscription");
    expect(state.status).toBe("past_due");
  });

  it("retains the payment lock warning when past-due accounts have no effective Pro access", () => {
    const html = render({ ...deriveBillingState(null), status: "past_due", stripeSubscriptionId: "sub_real" });
    expect(html).toContain("Billing features are locked until payment is updated");
    expect(html).not.toContain("Your Pro access remains active.");
    expect(html).toContain("Manage subscription");
  });

  it("does not show a payment warning for beta-only access without a Stripe issue", () => {
    const html = render({ ...deriveBillingState(null), plan: "pro", isProActive: true, isBetaProActive: true });
    expect(html).toBe("");
  });
});
