import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBillingPlan, getBillingPriceConfig, getPriceIdForPlan } from "@/lib/billing/plans";
import { getBillingAccountByUserId, upsertBillingAccount } from "@/lib/billing/server";
import {
  createStripeCustomer,
  createStripeSubscriptionCheckoutSession,
} from "@/lib/payments/stripe-billing";
import {
  apiError,
  E_UNAUTHORIZED,
  E_INVALID_BILLING_PLAN,
  E_BILLING_CONFIG_MISSING,
  E_BILLING_CHECKOUT_FAILED,
} from "@/lib/api-errors";

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
  email: string | null | undefined
): Promise<string> {
  const { row, error } = await getBillingAccountByUserId(admin, userId);
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

  const { error: upsertError } = await upsertBillingAccount(admin, userId, {
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

  const body = await request.json().catch(() => ({}));
  const plan = parseBillingPlan(body?.plan);
  if (!plan) {
    return apiError(E_INVALID_BILLING_PLAN, 400);
  }

  let priceId: string;
  let successUrl: string;
  let cancelUrl: string;
  try {
    const config = getBillingPriceConfig();
    priceId = getPriceIdForPlan(plan, config);
    ({ successUrl, cancelUrl } = readCheckoutUrls());
  } catch (error) {
    console.error("[billing.checkout] missing billing config", {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_BILLING_CONFIG_MISSING, 500);
  }

  const admin = createAdminClient();

  try {
    const stripeCustomerId = await ensureStripeCustomerId(admin, user.id, user.email);
    const session = await createStripeSubscriptionCheckoutSession({
      customerId: stripeCustomerId,
      plan,
      userId: user.id,
      priceId,
      successUrl,
      cancelUrl,
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
