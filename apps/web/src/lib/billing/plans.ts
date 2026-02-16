export const BILLING_PLANS = ["plus", "pro"] as const;

export type BillingPlan = (typeof BILLING_PLANS)[number];

export type BillingPriceConfig = {
  plus: string;
  pro: string;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseBillingPlan(value: unknown): BillingPlan | null {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "plus" || normalized === "pro") {
    return normalized;
  }
  return null;
}

export function getBillingPriceConfig(env: NodeJS.ProcessEnv = process.env): BillingPriceConfig {
  const plus = normalizeText(env.PRICE_PLUS);
  const pro = normalizeText(env.PRICE_PRO);

  const missing: string[] = [];
  if (!plus) missing.push("PRICE_PLUS");
  if (!pro) missing.push("PRICE_PRO");

  if (missing.length > 0) {
    throw new Error(`Missing required billing env vars: ${missing.join(", ")}`);
  }

  return { plus, pro };
}

export function getPriceIdForPlan(plan: BillingPlan, config: BillingPriceConfig): string {
  return plan === "plus" ? config.plus : config.pro;
}

export function getPlanFromPriceId(
  priceId: string | null | undefined,
  config: BillingPriceConfig
): BillingPlan | null {
  const normalized = normalizeText(priceId);
  if (!normalized) return null;
  if (normalized === config.plus) return "plus";
  if (normalized === config.pro) return "pro";
  return null;
}

/** Rank for plan ordering: higher = better. pro > plus. */
export function rankPlan(plan: BillingPlan | null): number {
  if (plan === "pro") return 2;
  if (plan === "plus") return 1;
  return 0;
}

/** Returns the higher-ranked plan (pro > plus). */
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

/** Plan to persist from webhook: only allow upgrade when status is active/trialing; otherwise do not raise (e.g. past_due/canceled). */
export function planToPersist(
  derivedPlan: BillingPlan | null,
  derivedStatus: string | null,
  existingPlan: BillingPlan | null
): BillingPlan | null {
  const status = String(derivedStatus ?? "").trim().toLowerCase();
  const active = status.length > 0 && ACTIVE_SUBSCRIPTION_STATUSES.has(status);
  if (active) return higherPlan(derivedPlan, existingPlan);
  if (rankPlan(derivedPlan) <= rankPlan(existingPlan)) return derivedPlan;
  return existingPlan;
}
