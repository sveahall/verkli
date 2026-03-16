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
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";
import { createPerUserRateLimiter } from "@/lib/rate-limit";

const redeemLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });

export const runtime = "nodejs";

const REFERRAL_CREDIT_BONUS = 100;

type ReferralRedemptionRow = {
  id: string;
  referrer_id: string;
  code: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  const rl = await redeemLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429);
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
    .select("id, referrer_id, code")
    .eq("redeemer_id", user.id)
    .maybeSingle();

  const existingRow = (existingRedemption as ReferralRedemptionRow | null) ?? null;
  if (existingRow && (existingRow.code !== code || existingRow.referrer_id !== referrerId)) {
    return apiError(E_REFERRAL_ALREADY_REDEEMED, 409);
  }

  try {
    let redemptionId = existingRow?.id ?? null;

    if (!redemptionId) {
      const { data: insertedRedemption, error: redemptionError } = await admin
        .from("referral_redemptions")
        .insert({
          redeemer_id: user.id,
          referrer_id: referrerId,
          code,
        })
        .select("id, referrer_id, code")
        .single();

      if (redemptionError) {
        if (redemptionError.code === "23505") {
          const { data: recoveredRedemption, error: recoveredError } = await admin
            .from("referral_redemptions")
            .select("id, referrer_id, code")
            .eq("redeemer_id", user.id)
            .maybeSingle();

          if (recoveredError) {
            throw recoveredError;
          }

          const recoveredRow = (recoveredRedemption as ReferralRedemptionRow | null) ?? null;
          if (!recoveredRow || recoveredRow.code !== code || recoveredRow.referrer_id !== referrerId) {
            return apiError(E_REFERRAL_ALREADY_REDEEMED, 409);
          }

          redemptionId = recoveredRow.id;
        } else {
          throw redemptionError;
        }
      } else {
        redemptionId = String((insertedRedemption as ReferralRedemptionRow | null)?.id ?? "").trim();
      }
    }

    if (!redemptionId) {
      throw new Error("[referrals redeem] redemption id missing after insert");
    }

    const { error: redeemerGrantError } = await admin.rpc(
      "grant_user_credits_once" as never,
      {
        p_user_id: user.id,
        p_delta: REFERRAL_CREDIT_BONUS,
        p_source: "referral_redeemer",
        p_source_id: redemptionId,
      },
    );

    if (redeemerGrantError) {
      throw redeemerGrantError;
    }

    const { error: referrerGrantError } = await admin.rpc(
      "grant_user_credits_once" as never,
      {
        p_user_id: referrerId,
        p_delta: REFERRAL_CREDIT_BONUS,
        p_source: "referral_referrer",
        p_source_id: redemptionId,
      },
    );

    if (referrerGrantError) {
      throw referrerGrantError;
    }

    return NextResponse.json({
      success: true,
      creditsAdded: REFERRAL_CREDIT_BONUS,
    });
  } catch (err) {
    console.error("[referrals redeem] failed", {
      userId: user.id,
      code,
      message: err instanceof Error ? err.message : String(err),
    });
    return apiError(E_REFERRAL_REDEEM_FAILED, 500);
  }
}
