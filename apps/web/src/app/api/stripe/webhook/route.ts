import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, E_GENERIC_ERROR, E_INVALID_REQUEST_BODY } from "@/lib/api-errors";

export const runtime = "nodejs";

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

type StripeCheckoutSessionObject = {
  id?: string | null;
  payment_status?: string | null;
};

type StripeWebhookEvent = {
  id?: string | null;
  type?: string | null;
  data?: { object?: StripeCheckoutSessionObject | null } | null;
};

function parseStripeSignatureHeader(value: string): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of value.split(",")) {
    const [key, ...rest] = part.trim().split("=");
    const val = rest.join("=");
    if (!key || !val) continue;

    if (key === "t") {
      const parsed = Number.parseInt(val, 10);
      if (Number.isFinite(parsed)) timestamp = parsed;
      continue;
    }

    if (key === "v1") {
      signatures.push(val);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return null;
  }

  return { timestamp, signatures };
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyStripeSignature(payload: string, signatureHeader: string, secret: string): boolean {
  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = `${parsed.timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return parsed.signatures.some((signature) => timingSafeHexEqual(signature, expected));
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("[stripe.webhook] missing STRIPE_WEBHOOK_SECRET");
    return apiError(E_GENERIC_ERROR, 500);
  }

  const rawBody = await request.text();
  if (!rawBody) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature || !verifyStripeSignature(rawBody, signature, webhookSecret)) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(rawBody) as StripeWebhookEvent;
  } catch {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: true });
  }

  const session = event.data?.object ?? null;
  const sessionId = String(session?.id ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ received: true, ignored: true });
  }

  // completed can be emitted for async methods before settlement.
  if (session?.payment_status !== "paid") {
    return NextResponse.json({ received: true, ignored: true });
  }

  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders" as never)
    .select("id, user_id, book_id, status, stripe_session_id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (orderError) {
    console.error("[stripe.webhook] order lookup failed", {
      eventId: String(event.id ?? ""),
      sessionId,
      code: orderError.code,
      message: orderError.message,
    });
    return apiError(E_GENERIC_ERROR, 500);
  }

  const row = order as
    | { id?: string; user_id?: string | null; book_id?: string | null; status?: string | null }
    | null;
  if (!row?.id || !row.user_id || !row.book_id) {
    return NextResponse.json({ received: true, ignored: true });
  }

  if (row.status !== "paid") {
    const { error: updateError } = await admin
      .from("orders" as never)
      .update({ status: "paid" })
      .eq("id", row.id)
      .in("status", ["pending", "failed"]);

    if (updateError) {
      console.error("[stripe.webhook] order update failed", {
        eventId: String(event.id ?? ""),
        sessionId,
        orderId: row.id,
        code: updateError.code,
        message: updateError.message,
      });
      return apiError(E_GENERIC_ERROR, 500);
    }
  }

  const { error: entitlementError } = await admin
    .from("entitlements" as never)
    .upsert(
      { user_id: row.user_id, book_id: row.book_id, source: "purchase" },
      { onConflict: "user_id,book_id" }
    );

  if (entitlementError) {
    console.error("[stripe.webhook] entitlement upsert failed", {
      eventId: String(event.id ?? ""),
      sessionId,
      orderId: row.id,
      code: entitlementError.code,
      message: entitlementError.message,
    });
    return apiError(E_GENERIC_ERROR, 500);
  }

  return NextResponse.json({ received: true, processed: true });
}
