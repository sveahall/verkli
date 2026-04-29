import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestBaseUrl } from "@/lib/request-url";
import {
  createOnboardingLink,
  getPayoutAccount,
} from "@/lib/payments/stripe-connect";

export const runtime = "nodejs";

// Stripe redirects here when the user starts onboarding, abandons, then
// resumes. We mint a fresh account link and bounce them back. If they have
// no Connect account yet (shouldn't happen normally), redirect them to the
// payouts page to start over.
export async function GET(request: Request) {
  const auth = await requireAuthorRoleForApi();
  if (!auth.user) return auth.response;

  const baseUrl = getRequestBaseUrl(request);
  const admin = createAdminClient();
  const existing = await getPayoutAccount(admin, auth.user.id);

  if (!existing) {
    return NextResponse.redirect(`${baseUrl}/author/billing/payouts?status=needs_onboarding`);
  }

  try {
    const url = await createOnboardingLink({
      stripeAccountId: existing.stripe_account_id,
      returnUrl: `${baseUrl}/api/billing/connect/return`,
      refreshUrl: `${baseUrl}/api/billing/connect/refresh`,
    });
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[billing.connect.refresh] failed", {
      userId: auth.user.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.redirect(
      `${baseUrl}/author/billing/payouts?status=onboarding_failed`
    );
  }
}
