import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, E_NOT_AUTHENTICATED } from "@/lib/api-errors";

/** GET /api/reader/subscriptions — reader's active author subscriptions. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(E_NOT_AUTHENTICATED, 401);

  const { data: subscriptions } = await supabase
    .from("author_subscriptions" as never)
    .select("id, author_id, status, amount_monthly, currency, current_period_end, created_at")
    .eq("subscriber_user_id", user.id)
    .in("status" as never, ["active", "past_due"])
    .order("created_at", { ascending: false });

  return NextResponse.json({ subscriptions: subscriptions ?? [] });
}
