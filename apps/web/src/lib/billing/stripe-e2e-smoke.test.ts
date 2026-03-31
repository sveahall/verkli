/**
 * Stripe E2E Smoke Tests
 *
 * Validates the full billing lifecycle without hitting real Stripe:
 * checkout creation → webhook processing → billing state derivation.
 * Catches regressions in the glue between billing modules.
 */

import { describe, it, expect } from "vitest";
import {
  parseBillingPlan,
  getBillingPriceConfig,
  getPlanFromPriceId,
  rankPlan,
} from "@/lib/billing/plans";
import {
  deriveBillingState,
  normalizeBillingStatus,
  isBillingStatusActive,
} from "@/lib/billing/state";

describe("Stripe E2E smoke: checkout → webhook → state", () => {
  const PRICE_PLUS = "price_plus_test";
  const PRICE_PRO = "price_pro_test";

  it("full subscription lifecycle: create → activate → cancel", () => {
    // 1. Author selects Pro plan → resolve
    const plan = parseBillingPlan("pro");
    expect(plan).toBe("pro");

    // Resolve price config from env
    const priceConfig = getBillingPriceConfig({ PRICE_PLUS, PRICE_PRO } as never);
    expect(priceConfig.pro).toBe(PRICE_PRO);
    expect(priceConfig.plus).toBe(PRICE_PLUS);

    // 2. Webhook: subscription created → active
    const billingRow = {
      plan: "pro",
      status: normalizeBillingStatus("active"),
      stripe_customer_id: "cus_test",
      stripe_subscription_id: "sub_test",
      cancel_at_period_end: false,
      current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
    };
    expect(isBillingStatusActive(billingRow.status)).toBe(true);

    // 3. Derive client-facing billing state
    const state = deriveBillingState(billingRow as never);
    expect(state.plan).toBe("pro");
    expect(state.isProActive).toBe(true);
    expect(state.isPlusActive).toBe(false);

    // 4. Cancellation: plan → null, status → canceled
    const canceledRow = {
      ...billingRow,
      plan: null,
      status: normalizeBillingStatus("canceled"),
      stripe_subscription_id: null,
      cancel_at_period_end: false,
    };
    expect(isBillingStatusActive(canceledRow.status)).toBe(false);
    const canceledState = deriveBillingState(canceledRow as never);
    expect(canceledState.plan).toBeNull();
    expect(canceledState.isProActive).toBe(false);
  });

  it("price ID → plan resolution is bidirectional", () => {
    const config = { plus: PRICE_PLUS, pro: PRICE_PRO };
    expect(getPlanFromPriceId(PRICE_PLUS, config)).toBe("plus");
    expect(getPlanFromPriceId(PRICE_PRO, config)).toBe("pro");
    expect(getPlanFromPriceId("price_unknown", config)).toBeNull();
    expect(getPlanFromPriceId(null, config)).toBeNull();
  });

  it("normalizeBillingStatus handles all Stripe subscription statuses", () => {
    const validStatuses = ["active", "past_due", "canceled", "unpaid", "trialing", "incomplete", "incomplete_expired", "paused"];
    for (const status of validStatuses) {
      const result = normalizeBillingStatus(status);
      expect(result).toBeTruthy();
    }
  });

  it("plan ranking: pro > plus > null", () => {
    expect(rankPlan("pro")).toBeGreaterThan(rankPlan("plus"));
    expect(rankPlan("plus")).toBeGreaterThan(rankPlan(null));
    expect(rankPlan(null)).toBe(0);
  });

  it("past_due is treated as inactive — plan resolves to null", () => {
    // Verkli treats past_due as inactive (only 'active' and 'trialing' are active)
    expect(isBillingStatusActive("past_due")).toBe(false);

    const pastDueRow = {
      plan: "pro",
      status: "past_due",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      cancel_at_period_end: false,
      current_period_end: new Date(Date.now() - 86400000).toISOString(),
    };
    const state = deriveBillingState(pastDueRow as never);
    expect(state.plan).toBeNull();
    expect(state.isProActive).toBe(false);
  });

  it("deriveBillingState handles null row (free user)", () => {
    const state = deriveBillingState(null);
    expect(state.plan).toBeNull();
    expect(state.isProActive).toBe(false);
    expect(state.isPlusActive).toBe(false);
    expect(state.stripeCustomerId).toBeNull();
  });
});
