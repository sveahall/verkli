import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCreditPack, CREDIT_PRICING_CONFIRMED } from "@/lib/billing/credit-packs";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProBillingForApi } from "@/lib/billing/server";
import {
  createCreditTopUpCheckoutSession,
  getStripeCheckoutSession,
} from "@/lib/payments/stripe";
import {
  apiError,
  E_UNAUTHORIZED,
  E_INVALID_REQUEST_BODY,
  E_CHECKOUT_SESSION_FAILED,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { getRequestBaseUrl } from "@/lib/request-url";

const checkoutLimiter = createPerUserRateLimiter({ name: "credits-checkout", maxPerMinute: 5 });

export const runtime = "nodejs";



export async function POST(request: Request) {
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

  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) {
    return proGate.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  // Placeholder prices must not be able to charge anyone. While the figures in
  // credit-packs.ts are unconfirmed the route does not exist, mirroring how
  // donations/checkout hides itself behind isDonationsEnabled().
  if (!CREDIT_PRICING_CONFIRMED) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // The ONLY thing the client chooses is which pack. Price, credit count and
  // currency are resolved server-side — see lib/billing/credit-packs.ts for why
  // reading `creditsDelta` from the body was a vulnerability, not a shortcut.
  const payload = (body ?? {}) as { packId?: unknown };

  const pack = getCreditPack(payload.packId);
  if (!pack) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const { amountMinor, credits: creditsDelta, currency } = pack;

  const admin = createAdminClient();

  // Reuse an active checkout session if the user clicks multiple times quickly.
  try {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from("credit_topups")
      .select("id, stripe_session_id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .eq("amount", amountMinor)
      .eq("currency", currency)
      .eq("credits_delta", creditsDelta)
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
        return NextResponse.json({ url: session.url, creditTopupId: existingRow.id });
      }
    }
  } catch (error) {
    console.warn("[credits.checkout] open-session reuse check failed, continuing", {
      userId: user.id,
      amountMinor,
      creditsDelta,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const { data: topup, error: topupInsertError } = await admin
    .from("credit_topups")
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

  if (topupInsertError || !topup) {
    console.error("[credits.checkout] failed to create topup row", {
      userId: user.id,
      amountMinor,
      creditsDelta,
      currency,
      code: topupInsertError?.code,
      message: topupInsertError?.message,
    });
    return apiError(E_CHECKOUT_SESSION_FAILED, 500);
  }

  const creditTopupId = String((topup as { id: string }).id);
  const baseUrl = getRequestBaseUrl(request);
  const successUrl = `${baseUrl}/reader/profile?credits=success`;
  const cancelUrl = `${baseUrl}/reader/profile?credits=cancel`;

  try {
    const session = await createCreditTopUpCheckoutSession({
      amountMinor,
      creditsDelta,
      currency,
      userId: user.id,
      creditTopupId,
      customerEmail: user.email,
      successUrl,
      cancelUrl,
    });

    const stripeSessionId = String(session.id ?? "").trim();
    if (!stripeSessionId) {
      throw new Error("Stripe session id is missing");
    }

    const { error: topupUpdateError } = await admin
      .from("credit_topups")
      .update({ stripe_session_id: stripeSessionId })
      .eq("id", creditTopupId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (topupUpdateError) {
      throw new Error(`Failed to persist stripe_session_id: ${topupUpdateError.message}`);
    }

    return NextResponse.json({ url: session.url, creditTopupId });
  } catch (error) {
    await admin
      .from("credit_topups")
      .update({ status: "failed" })
      .eq("id", creditTopupId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    console.error("[credits.checkout] failed", {
      userId: user.id,
      amountMinor,
      creditsDelta,
      creditTopupId,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_CHECKOUT_SESSION_FAILED, 500);
  }
}
