import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDonationCheckoutSession, getStripeCheckoutSession } from "@/lib/payments/stripe";
import {
  apiError,
  E_UNAUTHORIZED,
  E_DONATION_CHECKOUT_FAILED,
  E_INVALID_DONATION_AMOUNT,
  E_INVALID_PRICE_CURRENCY,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { getRequestBaseUrl } from "@/lib/request-url";
import { isDonationsEnabled } from "@/lib/flags";

const checkoutLimiter = createPerUserRateLimiter({ name: "donations-checkout", maxPerMinute: 5 });

export const runtime = "nodejs";

function toPositiveInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function isDonationCheckoutMockModeEnabled(): boolean {
  // Mock mode MUST be restricted to development to avoid handing out
  // "success" URLs without a real Stripe session in production.
  if (process.env.NODE_ENV === "production") return false;
  return process.env.DONATION_CHECKOUT_MOCK_MODE === "true";
}

/**
 * Credits granted by a donation.
 *
 * Zero, deliberately. A donation having a client-chosen *amount* is correct by
 * definition; a donation having a client-chosen *credit payout* is not. This
 * route used to read `creditsDelta` straight off the request body and never
 * validate it at all, and `finalize_donation_checkout_session` grants whatever
 * lands in `donations.credits_delta`. If donations should ever pay out credits,
 * derive the figure here from `amountMinor` — never accept it from the caller.
 */
const DONATION_CREDITS_DELTA = 0;

/**
 * ISO 4217 codes this route will charge in.
 *
 * An unsupported code is REJECTED, never coerced. Currency is the one field on
 * a payment where a silent fallback changes what the payer is charged: quietly
 * reading "GBP" as SEK turns an intended 50 GBP into 5000 SEK. `amountMinor`
 * already 400s when it is bad; this has to behave the same way.
 */
const ALLOWED_CURRENCIES = new Set(["SEK", "EUR", "USD"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const amountMinor = toPositiveInt(body?.amountMinor ?? body?.amount);
  const creditsDelta = DONATION_CREDITS_DELTA;
  const currency =
    typeof body?.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : "SEK";

  if (!ALLOWED_CURRENCIES.has(currency)) {
    return apiError(E_INVALID_PRICE_CURRENCY, 400);
  }

  const baseUrl = getRequestBaseUrl(request);

  // Sprint 0.5 (Task 11): donations are gated behind a top-level flag in
  // production. Until enabled per environment, treat the route as 404 so the
  // entry point is fully hidden. Mock-mode below remains a dev/test escape
  // hatch when both NODE_ENV !== production AND DONATION_CHECKOUT_MOCK_MODE
  // is explicitly set.
  if (process.env.NODE_ENV === "production" && !isDonationsEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (isDonationCheckoutMockModeEnabled()) {
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

  const rl = await checkoutLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429);
  }

  if (amountMinor <= 0) {
    return apiError(E_INVALID_DONATION_AMOUNT, 400);
  }

  const admin = createAdminClient();

  // Reuse a still-open session to avoid duplicate rows/charges on rapid re-clicks.
  try {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from("donations")
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
    .from("donations")
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
      .from("donations")
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
      .from("donations")
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
