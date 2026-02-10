import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
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

  const payload = (body ?? {}) as {
    amountMinor?: unknown;
    creditsDelta?: unknown;
    credits?: unknown;
    currency?: unknown;
  };

  const amountMinor = toPositiveInt(payload.amountMinor);
  const creditsDelta = toPositiveInt(payload.creditsDelta ?? payload.credits);
  const currency =
    typeof payload.currency === "string" && payload.currency.trim()
      ? payload.currency.trim().toUpperCase()
      : "SEK";

  if (amountMinor <= 0 || creditsDelta <= 0) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const admin = createAdminClient();

  // Reuse an active checkout session if the user clicks multiple times quickly.
  try {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from("credit_topups" as never)
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
    .from("credit_topups" as never)
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
  const baseUrl = getBaseUrl(request);
  const successUrl = `${baseUrl}/credits/success`;
  const cancelUrl = `${baseUrl}/credits/cancel`;

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
      .from("credit_topups" as never)
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
      .from("credit_topups" as never)
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
