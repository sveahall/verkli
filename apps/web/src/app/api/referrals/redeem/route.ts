import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_UNAUTHORIZED,
  E_REFERRAL_CODE_INVALID,
  E_REFERRAL_REDEEM_FAILED,
  E_REFERRAL_ALREADY_REDEEMED,
  E_REFERRAL_CANNOT_USE_OWN,
  E_INVALID_REFERRAL_CODE,
} from "@/lib/api-errors";

export const runtime = "nodejs";

const REFERRAL_CREDIT_BONUS = 100;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  const body = await request.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";

  if (!code) {
    return apiError(E_INVALID_REFERRAL_CODE, 400);
  }

  const admin = createAdminClient();

  const { data: refRow, error: refError } = await admin
    .from("referral_codes")
    .select("user_id")
    .eq("code", code)
    .maybeSingle();

  if (refError || !refRow) {
    return apiError(E_REFERRAL_CODE_INVALID, 404);
  }

  const referrerId = (refRow as { user_id: string }).user_id;
  if (referrerId === user.id) {
    return apiError(E_REFERRAL_CANNOT_USE_OWN, 400);
  }

  const { data: existingRedemption } = await admin
    .from("referral_redemptions")
    .select("id")
    .eq("redeemer_id", user.id)
    .maybeSingle();

  if (existingRedemption) {
    return apiError(E_REFERRAL_ALREADY_REDEEMED, 409);
  }

  try {
    const { error: redemptionError } = await admin.from("referral_redemptions").insert({
      redeemer_id: user.id,
      referrer_id: referrerId,
      code,
    });

    if (redemptionError) {
      if (redemptionError.code === "23505") {
        return apiError(E_REFERRAL_ALREADY_REDEEMED, 409);
      }
      throw redemptionError;
    }

    const { data: redeemerCredits } = await admin
      .from("user_credits")
      .select("user_id, token_balance")
      .eq("user_id", user.id)
      .maybeSingle();

    const currentBalance =
      typeof (redeemerCredits as { token_balance?: number } | null)?.token_balance === "number"
        ? (redeemerCredits as { token_balance: number }).token_balance
        : 0;

    const { error: upsertRedeemerError } = await admin.from("user_credits").upsert(
      {
        user_id: user.id,
        token_balance: currentBalance + REFERRAL_CREDIT_BONUS,
      },
      { onConflict: "user_id" }
    );

    if (upsertRedeemerError) {
      throw upsertRedeemerError;
    }

    const { data: referrerCredits } = await admin
      .from("user_credits")
      .select("user_id, token_balance")
      .eq("user_id", referrerId)
      .maybeSingle();

    const referrerBalance =
      typeof (referrerCredits as { token_balance?: number } | null)?.token_balance === "number"
        ? (referrerCredits as { token_balance: number }).token_balance
        : 0;

    const { error: upsertReferrerError } = await admin.from("user_credits").upsert(
      {
        user_id: referrerId,
        token_balance: referrerBalance + REFERRAL_CREDIT_BONUS,
      },
      { onConflict: "user_id" }
    );

    if (upsertReferrerError) {
      throw upsertReferrerError;
    }

    return NextResponse.json({
      success: true,
      creditsAdded: REFERRAL_CREDIT_BONUS,
    });
  } catch (err) {
    console.error("[referrals.redeem] failed", {
      userId: user.id,
      code,
      message: err instanceof Error ? err.message : String(err),
    });
    return apiError(E_REFERRAL_REDEEM_FAILED, 500);
  }
}
