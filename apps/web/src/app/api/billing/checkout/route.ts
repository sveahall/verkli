import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBillingPlan } from "@/lib/billing/plans";
import { getPriceIdForRolePlan } from "@/lib/billing/catalog";
import { getBillingAccountByUserIdAndRole, upsertBillingAccount } from "@/lib/billing/server";
import {
  createStripeCustomer,
  createStripeSubscriptionCheckoutSession,
} from "@/lib/payments/stripe-billing";
import { resolveBillingRole } from "@/lib/auth/billing-role";
import {
  apiError,
  E_UNAUTHORIZED,
  E_INVALID_BILLING_PLAN,
  E_BILLING_CHECKOUT_FAILED,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";
import { createPerUserRateLimiter } from "@/lib/rate-limit";

const checkoutLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });

export const runtime = "nodejs";

function readCheckoutUrls(): { successUrl: string; cancelUrl: string } {
  const successUrl = process.env.STRIPE_CHECKOUT_SUCCESS_URL?.trim() ?? "";
  const cancelUrl = process.env.STRIPE_CHECKOUT_CANCEL_URL?.trim() ?? "";

  if (!successUrl || !cancelUrl) {
    throw new Error("Missing STRIPE_CHECKOUT_SUCCESS_URL or STRIPE_CHECKOUT_CANCEL_URL");
  }

  return { successUrl, cancelUrl };
}

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

  const rl = await checkoutLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429);
  }

  const body = await request.json().catch(() => ({}));
  const plan = parseBillingPlan(body?.plan);
  if (!plan) {
    return apiError(E_INVALID_BILLING_PLAN, 400);
  }

  // The active_role cookie is client-writable; resolve the real role the
  // user may transact on so a reader cannot switch their cookie and buy the
  // author Pro plan (or vice versa).
  const role = await resolveBillingRole(request, user.id);

  let priceId: string | null = null;
  let successUrl: string;
  let cancelUrl: string;
  try {
    priceId = await getPriceIdForRolePlan(role, plan);
    ({ successUrl, cancelUrl } = readCheckoutUrls());
    // So we can sync billing state when user returns (e.g. localhost where webhook does not run).
    successUrl =
      successUrl + (successUrl.includes("?") ? "&" : "?") + "checkout=success&session_id={CHECKOUT_SESSION_ID}";
  } catch (error) {
    console.error("[billing.checkout] catalog lookup failed", {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_BILLING_CHECKOUT_FAILED, 500);
  }

  if (!priceId) {
    console.error("[billing.checkout] no price id for role/plan in catalog", {
      userId: user.id,
      role,
      plan,
    });
    return apiError(E_BILLING_CHECKOUT_FAILED, 500);
  }

  const admin = createAdminClient();

  try {
    const stripeCustomerId = await ensureStripeCustomerId(admin, user.id, role, user.email);
    const session = await createStripeSubscriptionCheckoutSession({
      customerId: stripeCustomerId,
      plan,
      userId: user.id,
      priceId,
      successUrl,
      cancelUrl,
      billingRole: role,
      billingPlan: plan,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[billing.checkout] failed to create subscription checkout session", {
      userId: user.id,
      plan,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_BILLING_CHECKOUT_FAILED, 500);
  }
}
