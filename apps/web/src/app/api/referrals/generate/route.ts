import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, E_UNAUTHORIZED, E_REFERRAL_GENERATE_FAILED } from "@/lib/api-errors";

export const runtime = "nodejs";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("referral_codes")
    .select("code")
    .eq("user_id", user.id)
    .maybeSingle();

  const existingRow = existing as { code: string } | null;
  if (existingRow?.code) {
    return NextResponse.json({ code: existingRow.code });
  }

  let code = generateCode();
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const { error } = await admin.from("referral_codes").insert({
      user_id: user.id,
      code,
    });

    if (!error) {
      return NextResponse.json({ code });
    }

    if (error.code === "23505") {
      code = generateCode();
      attempts++;
      continue;
    }

    console.error("[referrals.generate] insert failed", {
      userId: user.id,
      code: error.code,
      message: error.message,
    });
    return apiError(E_REFERRAL_GENERATE_FAILED, 500);
  }

  return apiError(E_REFERRAL_GENERATE_FAILED, 500);
}
