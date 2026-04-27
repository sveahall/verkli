import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, E_UNAUTHORIZED, E_REFERRAL_GENERATE_FAILED } from "@/lib/api-errors";

export const runtime = "nodejs";

export { POST } from "../generate/route";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  // RLS policy `referral_codes_select_own` already restricts SELECT to
  // `auth.uid() = user_id`, so the user-bound client is sufficient and we
  // avoid carrying service-role privileges through this read path.
  const { data, error } = await supabase
    .from("referral_codes")
    .select("code")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[referrals.code] lookup failed", {
      userId: user.id,
      code: error.code,
      message: error.message,
    });
    return apiError(E_REFERRAL_GENERATE_FAILED, 500);
  }

  const row = data as { code?: string | null } | null;
  const code = typeof row?.code === "string" ? row.code : null;

  return NextResponse.json({ code });
}
