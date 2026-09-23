import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, E_NOT_AUTHENTICATED, E_GENERIC_ERROR } from "@/lib/api-errors";

// Mark the current user as age-verified. Stores `age_verified_at` on
// `profiles`, which is the authoritative server-side record. Anonymous
// readers fall back to a 30-day localStorage flag set by the client modal.

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError(E_NOT_AUTHENTICATED, 401);

  const { error } = await supabase
    .from("profiles")
    .update({ age_verified_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) {
    console.error("[reader.age-verify] update failed", {
      userId: user.id,
      message: error.message,
    });
    return apiError(E_GENERIC_ERROR, 500);
  }

  return NextResponse.json({ ok: true });
}
