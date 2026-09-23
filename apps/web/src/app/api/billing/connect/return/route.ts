import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestBaseUrl } from "@/lib/request-url";
import { syncPayoutAccountFromStripe } from "@/lib/payments/stripe-connect";

export const runtime = "nodejs";

// Stripe redirects here after onboarding completes (success OR user cancels
// out cleanly). We re-sync our row from Stripe so the ledger reflects the
// post-onboarding state without waiting for the `account.updated` webhook,
// then redirect to the payouts page. The webhook will still fire and is the
// authoritative source.
export async function GET(request: Request) {
  const auth = await requireAuthorRoleForApi();
  if (!auth.user) return auth.response;

  const baseUrl = getRequestBaseUrl(request);
  const admin = createAdminClient();

  let payoutsEnabled = false;
  let detailsSubmitted = false;
  try {
    const synced = await syncPayoutAccountFromStripe(admin, auth.user.id);
    payoutsEnabled = synced.payouts_enabled;
    detailsSubmitted = synced.details_submitted;
  } catch (err) {
    // Don't block the redirect — webhook will reconcile.
    console.warn("[billing.connect.return] sync failed; falling back to webhook", {
      userId: auth.user.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const status = payoutsEnabled
    ? "payouts_enabled"
    : detailsSubmitted
      ? "kyc_submitted"
      : "kyc_incomplete";

  return NextResponse.redirect(
    `${baseUrl}/author/billing/payouts?status=${status}`
  );
}
