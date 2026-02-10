import { describe, expect, it } from "vitest";
import {
  parseBillingPlan,
  getBillingPriceConfig,
  getPlanFromPriceId,
} from "@/lib/billing/plans";
import {
  deriveBillingState,
  normalizeBillingStatus,
  isBillingStatusActive,
  type BillingAccountRow,
} from "@/lib/billing/state";
import { resolveErrorMessage } from "@/lib/error-messages";
import * as apiErrors from "@/lib/api-errors";

// ---------------------------------------------------------------------------
// 1. Billing plan parsing
// ---------------------------------------------------------------------------

describe("parseBillingPlan", () => {
  it("accepts 'plus' and 'pro'", () => {
    expect(parseBillingPlan("plus")).toBe("plus");
    expect(parseBillingPlan("pro")).toBe("pro");
  });

  it("is case-insensitive", () => {
    expect(parseBillingPlan("PLUS")).toBe("plus");
    expect(parseBillingPlan("Pro")).toBe("pro");
  });

  it("rejects garbage input", () => {
    expect(parseBillingPlan("free")).toBeNull();
    expect(parseBillingPlan("")).toBeNull();
    expect(parseBillingPlan(null)).toBeNull();
    expect(parseBillingPlan(undefined)).toBeNull();
    expect(parseBillingPlan(42)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Billing price config env validation
// ---------------------------------------------------------------------------

describe("getBillingPriceConfig", () => {
  it("returns config when both env vars are set", () => {
    const config = getBillingPriceConfig({
      PRICE_PLUS: "price_plus_1",
      PRICE_PRO: "price_pro_1",
    } as NodeJS.ProcessEnv);
    expect(config.plus).toBe("price_plus_1");
    expect(config.pro).toBe("price_pro_1");
  });

  it("throws when PRICE_PLUS is missing", () => {
    expect(() =>
      getBillingPriceConfig({ PRICE_PRO: "price_pro_1" } as NodeJS.ProcessEnv)
    ).toThrow("PRICE_PLUS");
  });

  it("throws when PRICE_PRO is missing", () => {
    expect(() =>
      getBillingPriceConfig({ PRICE_PLUS: "price_plus_1" } as NodeJS.ProcessEnv)
    ).toThrow("PRICE_PRO");
  });

  it("throws when both are missing", () => {
    expect(() => getBillingPriceConfig({} as NodeJS.ProcessEnv)).toThrow(
      "PRICE_PLUS"
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Price-to-plan reverse lookup
// ---------------------------------------------------------------------------

describe("getPlanFromPriceId", () => {
  const config = { plus: "price_plus_x", pro: "price_pro_x" };

  it("resolves plus price id", () => {
    expect(getPlanFromPriceId("price_plus_x", config)).toBe("plus");
  });

  it("resolves pro price id", () => {
    expect(getPlanFromPriceId("price_pro_x", config)).toBe("pro");
  });

  it("returns null for unknown price", () => {
    expect(getPlanFromPriceId("price_unknown", config)).toBeNull();
    expect(getPlanFromPriceId("", config)).toBeNull();
    expect(getPlanFromPriceId(null, config)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Billing state derivation
// ---------------------------------------------------------------------------

describe("deriveBillingState", () => {
  function makeRow(overrides: Partial<BillingAccountRow> = {}): BillingAccountRow {
    return {
      user_id: "user-1",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      plan: null,
      status: null,
      current_period_end: null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it("free user (null row) gets all inactive", () => {
    const state = deriveBillingState(null);
    expect(state.plan).toBeNull();
    expect(state.isPlusActive).toBe(false);
    expect(state.isProActive).toBe(false);
  });

  it("active plus subscription", () => {
    const state = deriveBillingState(makeRow({ plan: "plus", status: "active" }));
    expect(state.plan).toBe("plus");
    expect(state.isPlusActive).toBe(true);
    expect(state.isProActive).toBe(false);
  });

  it("active pro subscription includes plus", () => {
    const state = deriveBillingState(makeRow({ plan: "pro", status: "active" }));
    expect(state.plan).toBe("pro");
    expect(state.isPlusActive).toBe(true);
    expect(state.isProActive).toBe(true);
  });

  it("trialing counts as active", () => {
    const state = deriveBillingState(makeRow({ plan: "pro", status: "trialing" }));
    expect(state.isPlusActive).toBe(true);
    expect(state.isProActive).toBe(true);
  });

  it("past_due is not active", () => {
    const state = deriveBillingState(makeRow({ plan: "pro", status: "past_due" }));
    expect(state.status).toBe("past_due");
    expect(state.isPlusActive).toBe(false);
    expect(state.isProActive).toBe(false);
  });

  it("canceled is not active", () => {
    const state = deriveBillingState(makeRow({ plan: "plus", status: "canceled" }));
    expect(state.isPlusActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Billing status helpers
// ---------------------------------------------------------------------------

describe("billing status helpers", () => {
  it("normalizeBillingStatus trims and lowercases", () => {
    expect(normalizeBillingStatus(" Active ")).toBe("active");
    expect(normalizeBillingStatus(null)).toBeNull();
    expect(normalizeBillingStatus("")).toBeNull();
  });

  it("isBillingStatusActive recognizes active and trialing", () => {
    expect(isBillingStatusActive("active")).toBe(true);
    expect(isBillingStatusActive("trialing")).toBe(true);
    expect(isBillingStatusActive("past_due")).toBe(false);
    expect(isBillingStatusActive("canceled")).toBe(false);
    expect(isBillingStatusActive(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. All billing error keys have Swedish translations
// ---------------------------------------------------------------------------

describe("billing error message coverage", () => {
  const billingErrorKeys = [
    "INVALID_BILLING_PLAN",
    "BILLING_CONFIG_MISSING",
    "BILLING_CHECKOUT_FAILED",
    "BILLING_PORTAL_FAILED",
    "PRO_SUBSCRIPTION_REQUIRED",
    "SUBSCRIPTION_PAST_DUE",
    "CHECKOUT_START_FAILED",
    "CHECKOUT_SESSION_FAILED",
    "AUTHOR_CANNOT_BUY_OWN_BOOK",
    "BOOK_IS_FREE",
    "ALREADY_UNLOCKED",
  ];

  const fallback = resolveErrorMessage(null);

  for (const key of billingErrorKeys) {
    it(`"${key}" maps to a Swedish message (not the generic fallback)`, () => {
      const message = resolveErrorMessage(key);
      expect(message).not.toBe(fallback);
      expect(message.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Every E_* constant in api-errors has a matching error-messages entry
// ---------------------------------------------------------------------------

describe("api error key completeness", () => {
  const errorKeys = Object.entries(apiErrors)
    .filter(([key, value]) => key.startsWith("E_") && typeof value === "string")
    .map(([, value]) => value as string);

  const fallback = resolveErrorMessage(null);

  it("has at least 20 error keys", () => {
    expect(errorKeys.length).toBeGreaterThanOrEqual(20);
  });

  // GENERIC_ERROR intentionally maps to the same string as the default fallback
  const keysExcludingGeneric = errorKeys.filter((k) => k !== "GENERIC_ERROR");

  for (const key of keysExcludingGeneric) {
    it(`E_* key "${key}" has a Swedish translation`, () => {
      const message = resolveErrorMessage(key);
      expect(message).not.toBe(fallback);
    });
  }

  it('E_* key "GENERIC_ERROR" has a message', () => {
    const message = resolveErrorMessage("GENERIC_ERROR");
    expect(message.length).toBeGreaterThan(0);
  });
});
