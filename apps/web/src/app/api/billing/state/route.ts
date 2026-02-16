import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBillingStateForUser } from "@/lib/billing/server";
import { getActiveRoleFromRequest } from "@/lib/active-role";
import { apiError, E_UNAUTHORIZED, E_FORBIDDEN } from "@/lib/api-errors";

export const runtime = "nodejs";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export async function GET(request: Request) {
  noStore();

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

  const loaded = await getBillingStateForUser(user.id, role);
  if (!loaded.ok) {
    return loaded.response;
  }

  const body = {
    plan: loaded.state.plan,
    status: loaded.state.status,
    currentPeriodEnd: loaded.state.currentPeriodEnd,
    cancelAtPeriodEnd: loaded.state.cancelAtPeriodEnd,
    stripeCustomerId: loaded.state.stripeCustomerId,
    stripeSubscriptionId: loaded.state.stripeSubscriptionId,
    isPlusActive: loaded.state.isPlusActive,
    isProActive: loaded.state.isProActive,
    plusCancelAtPeriodEnd: loaded.state.plusCancelAtPeriodEnd,
    plusPeriodEnd: loaded.state.plusPeriodEnd,
  };

  const res = NextResponse.json(body);
  Object.entries(NO_CACHE_HEADERS).forEach(([key, value]) => {
    res.headers.set(key, value);
  });
  return res;
}
