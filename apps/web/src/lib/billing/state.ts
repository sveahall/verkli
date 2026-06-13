import { parseBillingPlan, type BillingPlan } from "@/lib/billing/plans";

export type BillingAccountRole = "reader" | "author";

export type BillingAccountRow = {
  provider: string;
  user_id: string;
  role: BillingAccountRole;
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
  isProPlusActive: boolean;
  /** True when user has an active Plus subscription that is set to cancel at period end (avslutad men fortfarande aktiv). */
  plusCancelAtPeriodEnd: boolean;
  /** When Plus is cancelling, the date it ends (ISO). */
  plusPeriodEnd: string | null;
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

/**
 * Derives state from the single billing_accounts row only.
 * resolvedPlanKey (plan) = row.plan when row.status is active/trialing, else null.
 * No Stripe price_id resolution; row is source of truth for UI active flags.
 */
export function deriveBillingState(row: BillingAccountRow | null): BillingState {
  const status = normalizeBillingStatus(row?.status);
  const active = isBillingStatusActive(status);
  const resolvedPlanKey = active ? parseBillingPlan(row?.plan) : null;

  return {
    plan: resolvedPlanKey,
    status,
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end ?? false),
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeSubscriptionId: row?.stripe_subscription_id ?? null,
    isPlusActive: resolvedPlanKey === "plus",
    isProActive: resolvedPlanKey === "pro",
    isProPlusActive: resolvedPlanKey === "pro_plus",
    plusCancelAtPeriodEnd: false,
    plusPeriodEnd: null,
  };
}
