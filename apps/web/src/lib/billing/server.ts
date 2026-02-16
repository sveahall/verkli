import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, E_GENERIC_ERROR, E_PRO_SUBSCRIPTION_REQUIRED, E_SUBSCRIPTION_PAST_DUE } from "@/lib/api-errors";
import {
  deriveBillingState,
  isBillingStatusActive,
  normalizeBillingStatus,
  type BillingAccountRow,
  type BillingAccountRole,
  type BillingState,
} from "@/lib/billing/state";
export type { BillingAccountRow, BillingAccountRole };
import type { BillingPlan } from "@/lib/billing/plans";

export type BillingAccountPatch = {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  plan?: BillingPlan | null;
  status?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
};

const PROVIDER_STRIPE = "stripe";

type AdminClient = ReturnType<typeof createAdminClient>;

function normalizeRole(value: unknown): BillingAccountRole | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "reader" || v === "author") return v;
  return null;
}

function normalizeRow(row: Record<string, unknown> | null): BillingAccountRow | null {
  if (!row || typeof row !== "object") return null;

  const userId = String(row.user_id ?? "").trim();
  const role = normalizeRole(row.role);
  if (!userId || !role) return null;

  return {
    provider: String(row.provider ?? PROVIDER_STRIPE).trim() || PROVIDER_STRIPE,
    user_id: userId,
    role,
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

/** Reads billing_accounts for exactly this (user_id, role). Role-scoped. */
export async function getBillingAccountByUserIdAndRole(
  admin: AdminClient,
  userId: string,
  role: BillingAccountRole
): Promise<{ row: BillingAccountRow | null; error: { code?: string; message: string } | null }> {
  const { data, error } = await admin
    .from("billing_accounts" as never)
    .select(
      "user_id, role, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end, updated_at"
    )
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();

  return {
    row: normalizeRow((data as Record<string, unknown> | null) ?? null),
    error: toError(error),
  };
}

/** Returns one row for this Stripe customer (e.g. to resolve user_id); multiple rows may exist per customer. */
export async function getBillingAccountByStripeCustomerId(
  admin: AdminClient,
  stripeCustomerId: string
): Promise<{ row: BillingAccountRow | null; error: { code?: string; message: string } | null }> {
  const { data, error } = await admin
    .from("billing_accounts" as never)
    .select(
      "user_id, role, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end, updated_at"
    )
    .eq("stripe_customer_id", stripeCustomerId)
    .limit(1)
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
      "user_id, role, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end, updated_at"
    )
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  return {
    row: normalizeRow((data as Record<string, unknown> | null) ?? null),
    error: toError(error),
  };
}

/**
 * Upserts billing_accounts for (user_id, role) only.
 * ON CONFLICT (user_id, role) DO UPDATE. Never overwrites another role's row.
 */
export async function upsertBillingAccount(
  admin: AdminClient,
  userId: string,
  role: BillingAccountRole,
  patch: BillingAccountPatch
): Promise<{ error: { code?: string; message: string } | null }> {
  const { error } = await admin.from("billing_accounts" as never).upsert(
    {
      user_id: userId,
      role,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,role" }
  );

  return { error: toError(error) };
}

export type ActiveBillingRole = "reader" | "author";

/**
 * Returns billing state scoped to role: reader sees only Plus (pro masked to plus), author sees row as-is.
 */
function scopeStateToRole(state: BillingState, role: ActiveBillingRole): BillingState {
  if (role === "reader") {
    const displayPlus = state.plan === "pro" || state.plan === "plus";
    return {
      ...state,
      plan: state.plan === "pro" ? "plus" : state.plan,
      isProActive: false,
      isPlusActive: displayPlus,
    };
  }
  return state;
}

/**
 * Fetches billing state for exactly (userId, role).
 * Query: SELECT ... FROM billing_accounts WHERE user_id = $1 AND role = $2.
 * Does not fetch by user only; each role is isolated.
 */
export async function getBillingStateForUser(
  userId: string,
  role: ActiveBillingRole
): Promise<
  | { ok: true; row: BillingAccountRow | null; state: BillingState }
  | { ok: false; response: Response }
> {
  const admin = createAdminClient();
  const { row, error } = await getBillingAccountByUserIdAndRole(admin, userId, role);

  if (error) {
    console.error("[billing] failed to load billing account", {
      userId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, response: apiError(E_GENERIC_ERROR, 500) };
  }

  // Row is source of truth; never use Stripe price_ids to compute plan for state.
  const state = scopeStateToRole(deriveBillingState(row), role);

  if (process.env.BILLING_DEBUG === "1") {
    console.debug("[billing] state", {
      role,
      rowPlan: row?.plan ?? null,
      rowStatus: row?.status ?? null,
      rowStripeSubscriptionId: row?.stripe_subscription_id ?? null,
      resolvedPlanKey: state.plan,
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
