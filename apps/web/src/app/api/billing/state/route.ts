import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBillingStateForUser } from "@/lib/billing/server";
import { apiError, E_UNAUTHORIZED } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  const loaded = await getBillingStateForUser(user.id);
  if (!loaded.ok) {
    return loaded.response;
  }

  return NextResponse.json({
    plan: loaded.state.plan,
    status: loaded.state.status,
    currentPeriodEnd: loaded.state.currentPeriodEnd,
    cancelAtPeriodEnd: loaded.state.cancelAtPeriodEnd,
    stripeCustomerId: loaded.state.stripeCustomerId,
    stripeSubscriptionId: loaded.state.stripeSubscriptionId,
    isPlusActive: loaded.state.isPlusActive,
    isProActive: loaded.state.isProActive,
  });
}
