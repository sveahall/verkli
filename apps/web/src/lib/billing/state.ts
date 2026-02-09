import { parseBillingPlan, type BillingPlan } from "@/lib/billing/plans";

export type BillingAccountRow = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
};

export type BillingState = {
  plan: BillingPlan | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  isPlusActive: boolean;
  isProActive: boolean;
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function normalizeBillingStatus(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isBillingStatusActive(status: string | null | undefined): boolean {
  const normalized = normalizeBillingStatus(status);
  if (!normalized) return false;
  return ACTIVE_STATUSES.has(normalized);
}

export function deriveBillingState(row: BillingAccountRow | null): BillingState {
  const plan = parseBillingPlan(row?.plan);
  const status = normalizeBillingStatus(row?.status);
  const active = isBillingStatusActive(status);
  const isPro = active && plan === "pro";

  return {
    plan,
    status,
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end ?? false),
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeSubscriptionId: row?.stripe_subscription_id ?? null,
    isPlusActive: active && (plan === "plus" || plan === "pro"),
    isProActive: isPro,
  };
}
