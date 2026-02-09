import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingAccountByUserId, upsertBillingAccount } from "@/lib/billing/server";
import {
  createStripeCustomer,
  createStripeCustomerPortalSession,
} from "@/lib/payments/stripe-billing";
import {
  apiError,
  E_UNAUTHORIZED,
  E_BILLING_CONFIG_MISSING,
  E_BILLING_PORTAL_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";

function getPortalReturnUrl(): string {
  const value = process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL?.trim() ?? "";
  if (!value) {
    throw new Error("Missing STRIPE_CUSTOMER_PORTAL_RETURN_URL");
  }
  return value;
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

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  let returnUrl: string;
  try {
    returnUrl = getPortalReturnUrl();
  } catch (error) {
    console.error("[billing.portal] missing billing config", {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_BILLING_CONFIG_MISSING, 500);
  }

  const admin = createAdminClient();

  try {
    const stripeCustomerId = await ensureStripeCustomerId(admin, user.id, user.email);
    const portalSession = await createStripeCustomerPortalSession({
      customerId: stripeCustomerId,
      returnUrl,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("[billing.portal] failed to create portal session", {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_BILLING_PORTAL_FAILED, 500);
  }
}
