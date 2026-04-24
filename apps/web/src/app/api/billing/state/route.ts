import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingStateForUser } from "@/lib/billing/server";
import { resolveBillingRole } from "@/lib/auth/billing-role";
import { apiError, E_UNAUTHORIZED } from "@/lib/api-errors";

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

  // Read the real role the user is allowed to query billing for — prevents
  // a reader from reading an author billing row by flipping the cookie.
  const role = await resolveBillingRole(request, user.id);

  const loaded = await getBillingStateForUser(user.id, role);
  if (!loaded.ok) {
    return loaded.response;
  }

  // Fetch trailer usage for authors so the wizard can display accurate quota
  let trailerUsedThisMonth = 0;
  if (role === "author") {
    try {
      const admin = createAdminClient();
      const now = new Date();
      const usageMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
      const { data: usage } = await admin
        .from("user_usage_monthly" as never)
        .select("trailer_count_this_month")
        .eq("user_id", user.id)
        .eq("usage_month", usageMonth)
        .maybeSingle();
      const row = usage as { trailer_count_this_month?: number | null } | null;
      trailerUsedThisMonth = Math.max(0, Number(row?.trailer_count_this_month ?? 0) || 0);
    } catch {
      // Non-blocking — default to 0
    }
  }

  const body = {
    plan: loaded.state.plan,
    status: loaded.state.status,
    currentPeriodEnd: loaded.state.currentPeriodEnd,
    cancelAtPeriodEnd: loaded.state.cancelAtPeriodEnd,
    isPlusActive: loaded.state.isPlusActive,
    isProActive: loaded.state.isProActive,
    plusCancelAtPeriodEnd: loaded.state.plusCancelAtPeriodEnd,
    plusPeriodEnd: loaded.state.plusPeriodEnd,
    trailerUsedThisMonth,
  };

  const res = NextResponse.json(body);
  Object.entries(NO_CACHE_HEADERS).forEach(([key, value]) => {
    res.headers.set(key, value);
  });
  return res;
}
