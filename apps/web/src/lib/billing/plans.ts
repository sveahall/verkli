// "pro_plus" is the higher author tier. Its Stripe price is OPTIONAL/env-gated:
// PRICE_PRO_PLUS is only set once the Stripe product exists, so the rest of
// billing keeps working (and the pricing page shows PRO+ as "coming soon")
// until then. Never make pro_plus a required price — that would break checkout
// for plus/pro when the env var is unset.
export const BILLING_PLANS = ["plus", "pro", "pro_plus"] as const;

export type BillingPlan = (typeof BILLING_PLANS)[number];

export type BillingPriceConfig = {
  plus: string;
  pro: string;
  pro_plus?: string;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseBillingPlan(value: unknown): BillingPlan | null {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "plus" || normalized === "pro" || normalized === "pro_plus") {
    return normalized;
  }
  return null;
}

export function getBillingPriceConfig(env: NodeJS.ProcessEnv = process.env): BillingPriceConfig {
  const plus = normalizeText(env.PRICE_PLUS);
  const pro = normalizeText(env.PRICE_PRO);
  // Optional — only present once the PRO+ Stripe product is created.
  const proPlus = normalizeText(env.PRICE_PRO_PLUS || env.STRIPE_PRO_PLUS_MONTHLY_PRICE_ID);

  const missing: string[] = [];
  if (!plus) missing.push("PRICE_PLUS");
  if (!pro) missing.push("PRICE_PRO");

  if (missing.length > 0) {
    throw new Error(`Missing required billing env vars: ${missing.join(", ")}`);
  }

  return { plus, pro, ...(proPlus ? { pro_plus: proPlus } : {}) };
}

/** Whether PRO+ is purchasable (its Stripe price has been configured). */
export function isProPlusConfigured(config: BillingPriceConfig): boolean {
  return Boolean(config.pro_plus);
}

export function getPriceIdForPlan(plan: BillingPlan, config: BillingPriceConfig): string {
  if (plan === "plus") return config.plus;
  if (plan === "pro_plus") return config.pro_plus ?? "";
  return config.pro;
}

export function getPlanFromPriceId(
  priceId: string | null | undefined,
  config: BillingPriceConfig
): BillingPlan | null {
  const normalized = normalizeText(priceId);
  if (!normalized) return null;
  if (normalized === config.plus) return "plus";
  if (normalized === config.pro) return "pro";
  if (config.pro_plus && normalized === config.pro_plus) return "pro_plus";
  return null;
}

/** Rank for plan ordering: higher = better. pro_plus > pro > plus. */
export function rankPlan(plan: BillingPlan | null): number {
  if (plan === "pro_plus") return 3;
  if (plan === "pro") return 2;
  if (plan === "plus") return 1;
  return 0;
}

/** Returns the higher-ranked plan (pro_plus > pro > plus). */
export function higherPlan(
  a: BillingPlan | null,
  b: BillingPlan | null
): BillingPlan | null {
  if (rankPlan(a) >= rankPlan(b)) return a ?? b;
  return b ?? a;
}

/** Resolve highest plan from price ids (pro > plus). Unknown price ids are ignored. */
export function resolveHighestPlanFromPriceIds(
  priceIds: string[],
  config: BillingPriceConfig
): BillingPlan | null {
  let resolved: BillingPlan | null = null;
  for (const priceId of priceIds) {
    const plan = getPlanFromPriceId(priceId, config);
    resolved = higherPlan(resolved, plan);
  }
  return resolved;
}

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

/**
 * Plan to persist from a webhook.
 *
 * Rules:
 *  - status active/trialing: allow upgrade to max(derived, existing).
 *  - any other status (past_due, unpaid, paused, incomplete, canceled, ...):
 *    keep the existing plan untouched. A transient payment failure must
 *    never silently demote a paying customer mid-retry.
 *
 * `customer.subscription.deleted` handles the "truly cancelled" case
 * separately in `processSubscriptionEvent` (plan cleared to null).
 */
export function planToPersist(
  derivedPlan: BillingPlan | null,
  derivedStatus: string | null,
  existingPlan: BillingPlan | null
): BillingPlan | null {
  const status = String(derivedStatus ?? "").trim().toLowerCase();
  const active = status.length > 0 && ACTIVE_SUBSCRIPTION_STATUSES.has(status);
  if (active) return higherPlan(derivedPlan, existingPlan);
  return existingPlan;
}
