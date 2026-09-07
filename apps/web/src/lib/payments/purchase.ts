import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeCheckoutSession } from "@/lib/payments/stripe";
import { logAnalyticsEvent } from "@/lib/analytics/events";
import {
  claimPaidOrderForReceipt,
  sendPurchaseReceipt,
} from "@/lib/payments/purchase-receipt";

type ConfirmStripePurchaseArgs = {
  orderId: string;
  sessionId: string;
  userId: string;
  bookId: string;
};

type ParsedOrder = {
  id: string;
  userId: string;
  bookId: string;
  stripeSessionId: string;
  chapterId: string | null;
  status: "pending" | "paid" | "failed";
  amount: number;
  currency: string;
};

function trimString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function errorCode(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code.trim() : fallback;
}

function parseOrder(value: unknown): ParsedOrder | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = trimString(row.id);
  const userId = trimString(row.user_id);
  const bookId = trimString(row.book_id);
  const stripeSessionId = trimString(row.stripe_session_id);
  const currency = trimString(row.currency);
  const status = row.status;
  const amount = row.amount;

  let chapterId: string | null = null;
  if (Object.hasOwn(row, "chapter_id") && row.chapter_id !== null) {
    chapterId = trimString(row.chapter_id);
    if (!chapterId) return null;
  }

  if (
    !id ||
    !userId ||
    !bookId ||
    !stripeSessionId ||
    !currency ||
    !Number.isSafeInteger(amount) ||
    Number(amount) <= 0 ||
    (status !== "pending" && status !== "paid" && status !== "failed")
  ) {
    return null;
  }

  return {
    id,
    userId,
    bookId,
    stripeSessionId,
    chapterId,
    status,
    amount: Number(amount),
    currency,
  };
}

function hasConflictingOptionalScope(
  session: Awaited<ReturnType<typeof getStripeCheckoutSession>>,
  order: ParsedOrder,
): boolean {
  if (
    session.amount_total !== undefined &&
    (!Number.isSafeInteger(session.amount_total) || session.amount_total !== order.amount)
  ) {
    return true;
  }

  if (
    session.currency !== undefined &&
    (typeof session.currency !== "string" ||
      session.currency.trim().toLowerCase() !== order.currency.toLowerCase())
  ) {
    return true;
  }

  const metadata = session.metadata ?? {};
  for (const key of ["payment_type", "payment_kind"] as const) {
    if (Object.hasOwn(metadata, key) && metadata[key] !== "book_purchase") return true;
  }

  if (Object.hasOwn(metadata, "chapter_id")) {
    const metadataChapterId = trimString(metadata.chapter_id);
    if (!metadataChapterId || metadataChapterId !== order.chapterId) return true;
  }

  return false;
}

/**
 * Outcome of a landing-page purchase confirmation.
 *
 * `processing` exists because Checkout no longer hardcodes card-only payments
 * (see `lib/payments/stripe.ts`). Delayed-notification methods settle after the
 * buyer is already redirected here, and that state is neither success nor
 * failure — telling such a buyer the purchase failed invites a double charge.
 */
export type ConfirmPurchaseResult = "paid" | "processing" | "failed";

export async function confirmStripeBookPurchase({
  orderId,
  sessionId,
  userId,
  bookId,
}: ConfirmStripePurchaseArgs): Promise<ConfirmPurchaseResult> {
  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders" as never)
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    console.error("[purchase.confirm] order lookup failed", {
      orderId,
      userId,
      bookId,
      code: errorCode(orderError, "order_lookup_failed"),
    });
    return "processing";
  }

  if (order === null) {
    return "failed";
  }

  const parsedOrder = parseOrder(order);
  if (!parsedOrder) {
    console.error("[purchase.confirm] unusable order", {
      orderId,
      userId,
      bookId,
      code: "invalid_order_shape",
    });
    return "processing";
  }

  if (
    parsedOrder.id !== orderId ||
    parsedOrder.userId !== userId ||
    parsedOrder.bookId !== bookId ||
    parsedOrder.stripeSessionId !== sessionId
  ) {
    return "failed";
  }

  let session: Awaited<ReturnType<typeof getStripeCheckoutSession>>;
  try {
    session = await getStripeCheckoutSession(sessionId);
  } catch (error) {
    console.error("[purchase.confirm] Stripe verification unavailable", {
      orderId,
      userId,
      bookId,
      sessionId,
      code: errorCode(error, "stripe_verification_unavailable"),
    });
    return "processing";
  }

  const fetchedSessionId = trimString(session.id);
  if (!fetchedSessionId) {
    console.error("[purchase.confirm] unusable Stripe session identity", {
      orderId,
      userId,
      bookId,
      sessionId,
      code: "invalid_stripe_session_identity",
    });
    return "processing";
  }
  if (session.id !== sessionId) return "failed";

  const rawMetadata: unknown = session.metadata;
  if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) {
    console.error("[purchase.confirm] unusable Stripe session metadata", {
      orderId,
      userId,
      bookId,
      sessionId,
      code: "invalid_stripe_metadata",
    });
    return "processing";
  }
  const metadata = rawMetadata as Record<string, unknown>;

  const metadataOrderId = trimString(metadata.order_id);
  const metadataUserId = trimString(metadata.user_id);
  const metadataBookId = trimString(metadata.book_id);

  if (!metadataOrderId || !metadataUserId || !metadataBookId) {
    console.error("[purchase.confirm] unusable Stripe session metadata", {
      orderId,
      userId,
      bookId,
      sessionId,
      code: "invalid_stripe_metadata_identity",
    });
    return "processing";
  }

  if (metadata.order_id !== orderId || metadata.user_id !== userId || metadata.book_id !== bookId) {
    return "failed";
  }

  if (hasConflictingOptionalScope(session, parsedOrder)) {
    console.error("[purchase.confirm] Stripe scope is inconsistent", {
      orderId,
      userId,
      bookId,
      sessionId,
      code: "stripe_scope_mismatch",
    });
    return "processing";
  }

  if (session.payment_status !== "paid") {
    // A delayed-notification method (Klarna, SEPA, Swish, …) completes Checkout
    // with payment_status "unpaid" and settles later via
    // checkout.session.async_payment_succeeded, which runs the same finalizer.
    //
    // Do NOT mark the order failed in that window. The buyer has committed to
    // paying, holds no entitlement yet, and the already-entitled 409 guard in
    // the checkout route therefore would not stop them from opening a second
    // session — so a "purchase failed, try again" message here can double-charge
    // a customer who did nothing wrong.
    //
    // Only Stripe's explicit expired + unpaid combination is terminal enough
    // for this read path to record failure. Open, complete, missing and unknown
    // states remain uncertain and must not invite a second payment.
    if (
      session.payment_status === "unpaid" &&
      session.status === "expired" &&
      parsedOrder.status === "pending"
    ) {
      const { data: failedOrder, error: failError } = await admin
        .from("orders" as never)
        .update({ status: "failed" })
        .eq("id", orderId)
        .eq("user_id", userId)
        .eq("stripe_session_id", sessionId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (failError) {
        console.error("[purchase.confirm] expired order update failed", {
          orderId,
          userId,
          bookId,
          sessionId,
          code: errorCode(failError, "expired_order_update_failed"),
        });
        return "processing";
      }

      if (trimString((failedOrder as { id?: unknown } | null)?.id) === orderId) {
        return "failed";
      }
    }

    return "processing";
  }

  // Claim before finalizing. This page runs on every reload and races the
  // webhook, so "the RPC said true" cannot gate the receipt — only the atomic
  // pending→paid transition can. See lib/payments/purchase-receipt.ts.
  const receiptClaim = await claimPaidOrderForReceipt(admin, sessionId);

  let finalized: unknown;
  let finalizeError: unknown;
  try {
    const result = await admin.rpc("finalize_order_checkout_session" as never, {
      p_stripe_session_id: sessionId,
    });
    finalized = result.data;
    finalizeError = result.error;
  } catch (error) {
    finalizeError = error;
  }

  if (finalizeError || finalized !== true) {
    console.error("[purchase.confirm] finalizer unavailable", {
      orderId,
      userId,
      bookId,
      sessionId,
      code: errorCode(finalizeError, "finalizer_not_confirmed"),
    });
    return "processing";
  }

  if (receiptClaim) {
    // Awaited for the same reason as the webhook handler: the claim is one-time,
    // so a promise killed at response time loses the receipt permanently rather
    // than deferring it. sendPurchaseReceipt swallows provider errors, so the
    // confirmed access is never rolled back or reported failed because of email.
    await sendPurchaseReceipt(admin, receiptClaim);
  }

  if (parsedOrder.status !== "paid") {
    try {
      await logAnalyticsEvent(admin, {
        eventType: "purchase_completed",
        userId,
        bookId,
        path: `/reader/books/${bookId}`,
        props: {
          provider: "stripe",
          orderId,
          chapterId: parsedOrder.chapterId ?? undefined,
        },
      });
    } catch (error) {
      console.warn("[purchase.confirm] analytics failed", {
        orderId,
        userId,
        bookId,
        code: errorCode(error, "analytics_failed"),
      });
    }
  }

  return "paid";
}
