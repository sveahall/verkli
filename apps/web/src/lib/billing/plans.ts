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
