import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, E_GENERIC_ERROR, E_PRO_SUBSCRIPTION_REQUIRED, E_SUBSCRIPTION_PAST_DUE } from "@/lib/api-errors";
import { deriveBillingState, type BillingAccountRow, type BillingState } from "@/lib/billing/state";
export type { BillingAccountRow };
import type { BillingPlan } from "@/lib/billing/plans";

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

export async function getBillingStateForUser(
  userId: string
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

  return {
    ok: true,
    row,
    state: deriveBillingState(row),
  };
}

export async function requireProBillingForApi(
  userId: string
): Promise<{ ok: true; state: BillingState } | { ok: false; response: Response }> {
  const loaded = await getBillingStateForUser(userId);
  if (!loaded.ok) return loaded;

  if (loaded.state.status === "past_due") {
    return { ok: false, response: apiError(E_SUBSCRIPTION_PAST_DUE, 402) };
  }

  if (!loaded.state.isProActive) {
    return { ok: false, response: apiError(E_PRO_SUBSCRIPTION_REQUIRED, 403) };
  }

  return { ok: true, state: loaded.state };
}
