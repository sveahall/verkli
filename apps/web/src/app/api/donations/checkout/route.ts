import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDonationCheckoutSession, getStripeCheckoutSession } from "@/lib/payments/stripe";
import {
  apiError,
  E_UNAUTHORIZED,
  E_DONATION_CHECKOUT_FAILED,
  E_INVALID_DONATION_AMOUNT,
} from "@/lib/api-errors";

export const runtime = "nodejs";

function getBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.endsWith("/") ? fromEnv.slice(0, -1) : fromEnv;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function toPositiveInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function isDonationCheckoutMockModeEnabled(): boolean {
  return process.env.DONATION_CHECKOUT_MOCK_MODE === "true";
}

function hasStripeSecretKey(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const amountMinor = toPositiveInt(body?.amountMinor ?? body?.amount);
  const creditsDelta = toPositiveInt(body?.creditsDelta ?? body?.creditDelta);
  const currency =
    typeof body?.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : "SEK";

  const baseUrl = getBaseUrl(request);

  if (isDonationCheckoutMockModeEnabled() && !hasStripeSecretKey()) {
    if (amountMinor <= 0) {
      return apiError(E_INVALID_DONATION_AMOUNT, 400);
    }
    return NextResponse.json({
      url: `${baseUrl}/donation/success?mock=donation`,
      donationId: "mock-donation",
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  if (amountMinor <= 0) {
    return apiError(E_INVALID_DONATION_AMOUNT, 400);
  }

  const admin = createAdminClient();

  // Reuse a still-open session to avoid duplicate rows/charges on rapid re-clicks.
  try {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from("donations" as never)
      .select("id, stripe_session_id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .eq("amount", amountMinor)
      .eq("currency", currency)
      .not("stripe_session_id", "is", null)
      .gte("created_at", twentyMinAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingRow =
      (existing as { id?: string | null; stripe_session_id?: string | null } | null) ?? null;
    const existingSessionId = String(existingRow?.stripe_session_id ?? "").trim();
    if (existingRow?.id && existingSessionId) {
      const session = await getStripeCheckoutSession(existingSessionId);
      if (session?.status === "open" && session?.url) {
        return NextResponse.json({ url: session.url, donationId: existingRow.id });
      }
    }
  } catch (error) {
    console.warn("[donations.checkout] open-session reuse check failed, continuing", {
      userId: user.id,
      amountMinor,
      currency,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const { data: donation, error: donationInsertError } = await admin
    .from("donations" as never)
    .insert({
      user_id: user.id,
      amount: amountMinor,
      currency,
      provider: "stripe",
      status: "pending",
      credits_delta: creditsDelta,
    })
    .select("id")
    .single();

  if (donationInsertError || !donation) {
    console.error("[donations.checkout] failed to create donation row", {
      userId: user.id,
      amountMinor,
      currency,
      creditsDelta,
      code: donationInsertError?.code,
      message: donationInsertError?.message,
    });
    return apiError(E_DONATION_CHECKOUT_FAILED, 500);
  }

  const donationId = String((donation as { id: string }).id);

  try {
    const session = await createDonationCheckoutSession({
      amountMinor,
      currency,
      userId: user.id,
      donationId,
      creditsDelta,
      customerEmail: user.email,
      successUrl: `${baseUrl}/donation/success`,
      cancelUrl: `${baseUrl}/donation/cancel`,
    });

    const stripeSessionId = String(session.id ?? "").trim();
    if (!stripeSessionId) {
      throw new Error("Stripe session id is missing");
    }

    const { error: donationUpdateError } = await admin
      .from("donations" as never)
      .update({ stripe_session_id: stripeSessionId })
      .eq("id", donationId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (donationUpdateError) {
      throw new Error(`Failed to persist stripe_session_id: ${donationUpdateError.message}`);
    }

    return NextResponse.json({ url: session.url, donationId });
  } catch (err) {
    await admin
      .from("donations" as never)
      .update({ status: "failed" })
      .eq("id", donationId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    console.error("[donations.checkout] failed", {
      userId: user.id,
      donationId,
      message: err instanceof Error ? err.message : String(err),
    });
    return apiError(E_DONATION_CHECKOUT_FAILED, 500);
  }
}
