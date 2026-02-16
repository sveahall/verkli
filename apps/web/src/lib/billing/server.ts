import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, E_GENERIC_ERROR, E_PRO_SUBSCRIPTION_REQUIRED, E_SUBSCRIPTION_PAST_DUE } from "@/lib/api-errors";
import {
  deriveBillingState,
  isBillingStatusActive,
  normalizeBillingStatus,
  type BillingAccountRow,
  type BillingState,
} from "@/lib/billing/state";
export type { BillingAccountRow };
import { rankPlan, type BillingPlan } from "@/lib/billing/plans";
import { resolveRolePlanFromPriceIds, type CatalogRole } from "@/lib/billing/catalog";
import { getStripeCustomerSubscriptions } from "@/lib/payments/stripe-billing";
import type { StripeSubscription } from "@/lib/payments/stripe-billing";

export type BillingAccountPatch = {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  plan?: BillingPlan | null;
  status?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
};

type AdminClient = ReturnType<typeof createAdminClient>;

function normalizeRow(row: Record<string, unknown> | null): BillingAccountRow | null {
  if (!row || typeof row !== "object") return null;

  const userId = String(row.user_id ?? "").trim();
  if (!userId) return null;

  return {
    user_id: userId,
    stripe_customer_id: row.stripe_customer_id ? String(row.stripe_customer_id) : null,
    stripe_subscription_id: row.stripe_subscription_id ? String(row.stripe_subscription_id) : null,
    plan: row.plan ? String(row.plan) : null,
    status: row.status ? String(row.status) : null,
    current_period_end: row.current_period_end ? String(row.current_period_end) : null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end ?? false),
    updated_at: row.updated_at ? String(row.updated_at) : new Date(0).toISOString(),
  };
}

function toError(error: { code?: string; message: string } | null): { code?: string; message: string } | null {
  if (!error) return null;
  return {
    code: error.code,
    message: error.message,
  };
}

export async function getBillingAccountByUserId(
  admin: AdminClient,
  userId: string
): Promise<{ row: BillingAccountRow | null; error: { code?: string; message: string } | null }> {
  const { data, error } = await admin
    .from("billing_accounts" as never)
    .select(
      "user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  return {
    row: normalizeRow((data as Record<string, unknown> | null) ?? null),
    error: toError(error),
  };
}

export async function getBillingAccountByStripeCustomerId(
  admin: AdminClient,
  stripeCustomerId: string
): Promise<{ row: BillingAccountRow | null; error: { code?: string; message: string } | null }> {
  const { data, error } = await admin
    .from("billing_accounts" as never)
    .select(
      "user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end, updated_at"
    )
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  return {
    row: normalizeRow((data as Record<string, unknown> | null) ?? null),
    error: toError(error),
  };
}

export async function getBillingAccountByStripeSubscriptionId(
  admin: AdminClient,
  stripeSubscriptionId: string
): Promise<{ row: BillingAccountRow | null; error: { code?: string; message: string } | null }> {
  const { data, error } = await admin
    .from("billing_accounts" as never)
    .select(
      "user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end, updated_at"
    )
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  return {
    row: normalizeRow((data as Record<string, unknown> | null) ?? null),
    error: toError(error),
  };
}

export async function upsertBillingAccount(
  admin: AdminClient,
  userId: string,
  patch: BillingAccountPatch
): Promise<{ error: { code?: string; message: string } | null }> {
  const { error } = await admin.from("billing_accounts" as never).upsert(
    {
      user_id: userId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  return { error: toError(error) };
}

const ACTIVE_STRIPE_STATUSES = new Set(["active", "trialing"]);

function stateFromStripeSubscription(
  sub: StripeSubscription,
  plan: BillingPlan | null,
  stripeCustomerId: string,
  plusEnding: { cancelAtPeriodEnd: boolean; periodEnd: string | null }
): BillingState {
  const status = normalizeBillingStatus(sub.status);
  const active = isBillingStatusActive(status);
  const currentPeriodEnd =
    sub.current_period_end != null && Number.isFinite(sub.current_period_end)
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;
  return {
    plan,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    stripeCustomerId,
    stripeSubscriptionId: sub.id,
    isPlusActive: active && (plan === "plus" || plan === "pro"),
    isProActive: active && plan === "pro",
    plusCancelAtPeriodEnd: plusEnding.cancelAtPeriodEnd,
    plusPeriodEnd: plusEnding.periodEnd,
  };
}

/** When we have a Stripe customer id, resolve state from live subscriptions for the given role (catalog-based). */
async function enrichStateFromStripe(
  row: BillingAccountRow | null,
  role: CatalogRole
): Promise<BillingState | null> {
  const customerId = row?.stripe_customer_id ?? null;
  if (!customerId) return null;

  let subscriptions: StripeSubscription[];
  try {
    subscriptions = await getStripeCustomerSubscriptions(customerId);
  } catch {
    return null;
  }

  const activeSubs = subscriptions.filter(
    (s) => s.status && ACTIVE_STRIPE_STATUSES.has(s.status.toLowerCase())
  );
  if (activeSubs.length === 0) return null;

  const subsForRole: { sub: StripeSubscription; plan: BillingPlan }[] = [];
  for (const sub of activeSubs) {
    const resolved = await resolveRolePlanFromPriceIds(sub.price_ids);
    if (resolved && resolved.role === role) {
      subsForRole.push({ sub, plan: resolved.planKey as BillingPlan });
    }
  }
  if (subsForRole.length === 0) return null;

  let best = subsForRole[0];
  for (const entry of subsForRole) {
    if (rankPlan(entry.plan) > rankPlan(best.plan)) {
      best = entry;
    }
  }

  let plusEnding: { cancelAtPeriodEnd: boolean; periodEnd: string | null } = {
    cancelAtPeriodEnd: false,
    periodEnd: null,
  };
  for (const entry of subsForRole) {
    if (entry.plan === "plus" && entry.sub.cancel_at_period_end) {
      plusEnding = {
        cancelAtPeriodEnd: true,
        periodEnd:
          entry.sub.current_period_end != null && Number.isFinite(entry.sub.current_period_end)
            ? new Date(entry.sub.current_period_end * 1000).toISOString()
            : null,
      };
      break;
    }
  }

  return stateFromStripeSubscription(best.sub, best.plan, customerId, plusEnding);
}

export type ActiveBillingRole = "reader" | "author";

/**
 * Returns billing state scoped to role: reader sees only Plus, author only Pro.
 */
function scopeStateToRole(state: BillingState, role: ActiveBillingRole): BillingState {
  if (role === "reader") {
    return {
      ...state,
      plan: state.plan === "pro" ? "plus" : state.plan,
      isProActive: false,
    };
  }
  return state;
}

export async function getBillingStateForUser(
  userId: string,
  role: ActiveBillingRole
): Promise<
  | { ok: true; row: BillingAccountRow | null; state: BillingState }
  | { ok: false; response: Response }
> {
  const admin = createAdminClient();
  const { row, error } = await getBillingAccountByUserId(admin, userId);

  if (error) {
    console.error("[billing] failed to load billing account", {
      userId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, response: apiError(E_GENERIC_ERROR, 500) };
  }

  const stateFromLive =
    (await enrichStateFromStripe(row, role)) ?? deriveBillingState(row);
  const state = scopeStateToRole(stateFromLive, role);

  if (process.env.BILLING_DEBUG === "1") {
    console.debug("[billing] state", {
      subscriptionId: row?.stripe_subscription_id ?? null,
      status: row?.status ?? null,
      plan: row?.plan ?? null,
      resolvedPlanKey: state.plan,
      role,
    });
  }

  return {
    ok: true,
    row,
    state,
  };
}

export async function requireProBillingForApi(
  userId: string
): Promise<{ ok: true; state: BillingState } | { ok: false; response: Response }> {
  const loaded = await getBillingStateForUser(userId, "author");
  if (!loaded.ok) return loaded;

  if (loaded.state.status === "past_due") {
    return { ok: false, response: apiError(E_SUBSCRIPTION_PAST_DUE, 402) };
  }

  if (!loaded.state.isProActive) {
    return { ok: false, response: apiError(E_PRO_SUBSCRIPTION_REQUIRED, 403) };
  }

  return { ok: true, state: loaded.state };
}
