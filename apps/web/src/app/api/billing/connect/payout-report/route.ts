import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { apiError, E_RATE_LIMIT_EXCEEDED } from "@/lib/api-errors";
import { getPayoutAccount } from "@/lib/payments/stripe-connect";
import { getConnectedPayoutSnapshot, payoutReportCsv } from "@/lib/payments/stripe-payouts";

// Matches the 5/min every sibling billing route carries. This one needs it
// more than most: the page links to it with a plain <a href>, so a held-down
// refresh is an unthrottled loop, and each GET makes two live Stripe calls.
// Stripe rate-limits per PLATFORM account, not per connected account, so that
// loop drains the same budget checkout, portal and buyer checkout draw from.
const reportLimiter = createPerUserRateLimiter({
  name: "billing-connect-payout-report",
  maxPerMinute: 5,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthorRoleForApi();
  if (!auth.user) return auth.response;

  const rl = await reportLimiter.check(auth.user.id);
  if (!rl.allowed) return apiError(E_RATE_LIMIT_EXCEEDED, 429);

  try {
    const account = await getPayoutAccount(createAdminClient(), auth.user.id);
    if (!account) {
      return NextResponse.json({ error: "Connect a payout account before downloading a report." }, { status: 409 });
    }
    const snapshot = await getConnectedPayoutSnapshot(account.stripe_account_id);
    return new Response(payoutReportCsv(snapshot), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="verkli-stripe-payouts-latest-100.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[author payouts] report failed", {
      userId: auth.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Payout report is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
