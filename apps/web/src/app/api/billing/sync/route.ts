import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCheckoutSessionWithLineItems,
  getStripeCustomerSubscriptions,
  listStripeCustomersByEmail,
} from "@/lib/payments/stripe-billing";
import { resolveRolePlanFromPriceIds } from "@/lib/billing/catalog";
import { parseBillingPlan, planToPersist, type BillingPlan } from "@/lib/billing/plans";
import {
  getBillingAccountByUserIdAndRole,
  upsertBillingAccount,
  type BillingAccountPatch,
} from "@/lib/billing/server";
import { getActiveRoleFromRequest } from "@/lib/active-role";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import {
  apiError,
  E_UNAUTHORIZED,
  E_FORBIDDEN,
  E_INVALID_REQUEST_BODY,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";

export const runtime = "nodejs";

const syncLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

type StripeRecord = Record<string, unknown>;

function asRecord(value: unknown): StripeRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as StripeRecord;
}

function trimToNull(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

function extractStripeId(value: unknown): string | null {
  if (typeof value === "string") return trimToNull(value);
  const r = asRecord(value);
  return r ? trimToNull(r.id) : null;
}

function extractMetadata(value: unknown): Record<string, string> {
  const r = asRecord(value);
  if (!r) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function extractPriceIdsFromCheckoutSession(session: StripeRecord): string[] {
  const lineItems = asRecord(session.line_items);
  if (!lineItems || !Array.isArray(lineItems.data)) return [];
  const ids: string[] = [];
  for (const item of lineItems.data) {
    const itemRecord = asRecord(item);
    const priceRecord = asRecord(itemRecord?.price);
    const priceId = trimToNull(priceRecord?.id) ?? (typeof itemRecord?.price === "string" ? trimToNull(itemRecord.price) : null);
    if (priceId) ids.push(priceId);
  }
  return ids;
}

/**
 * Sync billing_accounts from a Stripe checkout session.
 * Use when the user returns from Stripe success (e.g. localhost where webhook did not run).
 * Requires session_id and active_role cookie.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  const rl = await syncLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, { retryAfterSeconds: rl.retryAfterSeconds });
  }

  const role = getActiveRoleFromRequest(request);
  if (!role) {
    return apiError(E_FORBIDDEN, 403);
  }

  let sessionId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    sessionId = trimToNull((body as { session_id?: unknown }).session_id);
  } catch {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  if (!sessionId) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  let session: StripeRecord;
  try {
    session = await getCheckoutSessionWithLineItems(sessionId);
  } catch (error) {
    console.error("[billing.sync] failed to fetch Stripe session", {
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const mode = trimToNull(session.mode);
  if (mode !== "subscription") {
    return NextResponse.json({ ok: false, reason: "not_subscription" }, { status: 400 });
  }

  const metadata = extractMetadata(session.metadata);
  const userId = trimToNull(metadata.user_id);
  if (!userId || userId !== user.id) {
    return apiError(E_FORBIDDEN, 403);
  }

  const priceIds = extractPriceIdsFromCheckoutSession(session);
  const resolved = priceIds.length > 0 ? await resolveRolePlanFromPriceIds(priceIds) : null;
  if (!resolved) {
    console.warn("[billing.sync] could not resolve role/plan from price ids", { sessionId, priceIds });
    return NextResponse.json({ ok: false, reason: "unknown_plan" }, { status: 400 });
  }

  const subscriptionId = extractStripeId(session.subscription);
  const customerId = extractStripeId(session.customer);
  const derivedStatus = trimToNull(session.payment_status) === "paid" ? "active" : trimToNull(session.status) ?? null;

  const admin = createAdminClient();
  const { row: existing } = await getBillingAccountByUserIdAndRole(admin, user.id, resolved.role);
  const existingPlan = parseBillingPlan(existing?.plan);
  const plan = planToPersist(resolved.planKey as BillingPlan, derivedStatus ?? "active", existingPlan);

  const patch: BillingAccountPatch = {
    stripe_customer_id: customerId ?? existing?.stripe_customer_id ?? null,
    stripe_subscription_id: subscriptionId ?? existing?.stripe_subscription_id ?? null,
    plan: plan ?? undefined,
    status: derivedStatus ?? undefined,
  };

  const { error } = await upsertBillingAccount(admin, user.id, resolved.role, patch);
  if (error) {
    console.error("[billing.sync] upsert failed", { userId: user.id, role: resolved.role, message: error.message });
    return apiError(E_INVALID_REQUEST_BODY, 500);
  }

  return NextResponse.json({ ok: true });
}

/**
 * Sync billing state from Stripe customer subscriptions (e.g. after purchase when webhook did not run).
 * If we have a row with stripe_customer_id: list subscriptions and update plan/status for current role.
 * If we have no row or no stripe_customer_id: try to find Stripe customer by user email and recover
 * an active subscription that matches this role, then upsert the billing row.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  const role = getActiveRoleFromRequest(request);
  if (!role) {
    return apiError(E_FORBIDDEN, 403);
  }

  const admin = createAdminClient();
  const { row, error } = await getBillingAccountByUserIdAndRole(admin, user.id, role);

  let customerIdsToTry: string[] = [];
  if (!error && row?.stripe_customer_id?.trim()) {
    customerIdsToTry = [row.stripe_customer_id.trim()];
  } else {
    // No row or no customer_id: try to find Stripe customer(s) by email (recover from Stripe).
    const email = (user.email ?? "").trim();
    if (email) {
      try {
        const customers = await listStripeCustomersByEmail(email);
        customerIdsToTry = customers.map((c) => c.id);
      } catch (e) {
        console.warn("[billing.sync] GET: listStripeCustomersByEmail failed", {
          userId: user.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    if (customerIdsToTry.length === 0) {
      console.warn("[billing.sync] GET: no row or customer", { userId: user.id, role });
      return NextResponse.json({ ok: false, reason: "no_billing_row_or_customer" }, { status: 400 });
    }
  }

  const existingRow = row ?? null;
  for (const customerId of customerIdsToTry) {
    let subscriptions: Awaited<ReturnType<typeof getStripeCustomerSubscriptions>>;
    try {
      subscriptions = await getStripeCustomerSubscriptions(customerId);
    } catch (e) {
      console.error("[billing.sync] getStripeCustomerSubscriptions failed", {
        customerId,
        message: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    const active = subscriptions.filter(
      (s) => s.status && ACTIVE_STATUSES.has(s.status.toLowerCase())
    );
    if (process.env.BILLING_DEBUG === "1") {
      console.debug("[billing.sync] GET", {
        userId: user.id,
        role,
        stripeCustomerId: customerId,
        subscriptionCount: subscriptions.length,
        activeCount: active.length,
      });
    }
    for (const sub of active) {
      const resolved = await resolveRolePlanFromPriceIds(sub.price_ids);
      if (resolved && resolved.role === role) {
        const plan = planToPersist(
          resolved.planKey as BillingPlan,
          sub.status ?? "active",
          parseBillingPlan(existingRow?.plan)
        );
        const currentPeriodEnd =
          sub.current_period_end != null && Number.isFinite(sub.current_period_end)
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;
        const { error: upsertErr } = await upsertBillingAccount(admin, user.id, role, {
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          plan: plan ?? undefined,
          status: sub.status ?? undefined,
          current_period_end: currentPeriodEnd ?? undefined,
          cancel_at_period_end: sub.cancel_at_period_end,
        });
        if (upsertErr) {
          console.error("[billing.sync] upsert failed", { userId: user.id, role, message: upsertErr.message });
          return apiError(E_INVALID_REQUEST_BODY, 500);
        }
        return NextResponse.json({ ok: true });
      }
    }
  }

  console.warn("[billing.sync] GET: no active subscription matched role/catalog", {
    userId: user.id,
    role,
  });
  return NextResponse.json({ ok: false, reason: "no_matching_subscription" }, { status: 200 });
}
