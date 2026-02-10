import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const admin = createAdminClient();
  const { data, error } = await admin
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
