import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBillingAccountByUserIdAndRole,
  upsertBillingAccount,
  type BillingAccountPatch,
} from "@/lib/billing/server";
import { resolveRolePlanFromPriceIds } from "@/lib/billing/catalog";
import { parseBillingPlan, planToPersist, type BillingPlan } from "@/lib/billing/plans";
import {
  createStripeCustomer,
  createStripeCustomerPortalSession,
  getStripeCustomerSubscriptions,
  listStripeCustomersByEmail,
} from "@/lib/payments/stripe-billing";
import { getActiveRoleFromRequest } from "@/lib/active-role";
import {
  apiError,
  E_UNAUTHORIZED,
  E_FORBIDDEN,
  E_BILLING_PORTAL_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/** Base URL for app (e.g. https://app.example.com or http://localhost:3000). Never throws. */
function getAppBaseUrl(request: Request): string {
  const envUrl =
    process.env.STRIPE_CUSTOMER_PORTAL_RETURN_BASE ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL;
  if (envUrl) {
    const base = String(envUrl).trim();
    return base.startsWith("http") ? base.replace(/\/$/, "") : `https://${base}`;
  }
  try {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "http://localhost:3000";
  }
}

/**
 * Returns stripe_customer_id for this (userId, role). If we have a row with customer_id, use it.
 * If we have no row or no customer_id, try to find an existing Stripe customer by email with
 * an active subscription for this role (recover from Stripe); only create a new customer if none found.
 */
async function ensureStripeCustomerId(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  role: "reader" | "author",
  email: string | null | undefined
): Promise<string> {
  const { row, error } = await getBillingAccountByUserIdAndRole(admin, userId, role);
  if (error) {
    throw new Error(`Failed to load billing account: ${error.message}`);
  }

  const existingCustomerId = row?.stripe_customer_id?.trim() ?? "";
  if (existingCustomerId) {
    return existingCustomerId;
  }

  // Try to find existing Stripe customer by email with active subscription for this role.
  const emailTrimmed = (email ?? "").trim();
  if (emailTrimmed) {
    try {
      const customers = await listStripeCustomersByEmail(emailTrimmed);
      for (const { id: customerId } of customers) {
        const subscriptions = await getStripeCustomerSubscriptions(customerId);
        const active = subscriptions.filter(
          (s) => s.status && ACTIVE_STATUSES.has(s.status.toLowerCase())
        );
        for (const sub of active) {
          const resolved = await resolveRolePlanFromPriceIds(sub.price_ids);
          if (resolved && resolved.role === role) {
            const plan = planToPersist(
              resolved.planKey as BillingPlan,
              sub.status ?? "active",
              parseBillingPlan(row?.plan)
            );
            const currentPeriodEnd =
              sub.current_period_end != null && Number.isFinite(sub.current_period_end)
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null;
            const patch: BillingAccountPatch = {
              stripe_customer_id: customerId,
              stripe_subscription_id: sub.id,
              plan: plan ?? undefined,
              status: sub.status ?? undefined,
              current_period_end: currentPeriodEnd ?? undefined,
              cancel_at_period_end: sub.cancel_at_period_end,
            };
            const { error: upsertErr } = await upsertBillingAccount(admin, userId, role, patch);
            if (!upsertErr) {
              return customerId;
            }
          }
        }
      }
    } catch (e) {
      console.warn("[billing.portal] recovery by email failed", {
        userId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const customer = await createStripeCustomer({
    userId,
    email,
  });

  const { error: upsertError } = await upsertBillingAccount(admin, userId, role, {
    stripe_customer_id: customer.id,
  });

  if (upsertError) {
    throw new Error(`Failed to persist stripe_customer_id: ${upsertError.message}`);
  }

  return customer.id;
}

export async function POST(request: Request) {
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

  // Land back on the same billing page (reader/billing or author/billing) to avoid redirect chains and reload loops.
  const baseUrl = getAppBaseUrl(request);
  const returnUrl =
    role === "reader"
      ? `${baseUrl}/reader/billing`
      : `${baseUrl}/author/billing`;

  const admin = createAdminClient();

  try {
    const stripeCustomerId = await ensureStripeCustomerId(admin, user.id, role, user.email);
    // Do not pass subscriptionId: Stripe requires "Subscription update" to be enabled in
    // Customer portal settings. Opening without it shows the default billing overview; user can click into the subscription there.
    const portalSession = await createStripeCustomerPortalSession({
      customerId: stripeCustomerId,
      returnUrl,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const cause = err.cause instanceof Error ? err.cause.message : undefined;
    console.error("[billing.portal] failed to create portal session", {
      userId: user.id,
      role,
      returnUrl,
      message: err.message,
      cause,
    });
    return apiError(E_BILLING_PORTAL_FAILED, 500);
  }
}
