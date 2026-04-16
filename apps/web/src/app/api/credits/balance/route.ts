import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, E_UNAUTHORIZED, E_CREDITS_LOAD_FAILED } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  const { data: row, error } = await supabase
    .from("user_credits")
    .select("token_balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[credits.balance] fetch failed", {
      userId: user.id,
      code: error.code,
      message: error.message,
    });
    return apiError(E_CREDITS_LOAD_FAILED, 500);
  }

  const balance = typeof row?.token_balance === "number" ? row.token_balance : 0;
  return NextResponse.json({ balance });
}
