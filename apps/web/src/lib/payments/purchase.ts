import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeCheckoutSession } from "@/lib/payments/stripe";
import { logAnalyticsEvent } from "@/lib/analytics/events";

type ConfirmStripePurchaseArgs = {
  orderId: string;
  sessionId: string;
  userId: string;
  bookId: string;
};

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
    .select("id, user_id, book_id, chapter_id, status, amount, currency")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return "failed";
  }

  const orderUserId = String((order as { user_id?: string }).user_id ?? "");
  const orderBookId = String((order as { book_id?: string }).book_id ?? "");
  const orderStatus = String((order as { status?: string }).status ?? "");
  const orderChapterId = (order as { chapter_id?: string | null }).chapter_id ?? null;

  if (orderUserId !== userId || orderBookId !== bookId) {
    return "failed";
  }

  const session = await getStripeCheckoutSession(sessionId);
  const metadata = session.metadata ?? {};

  const metadataOrderId = String(metadata.order_id ?? "");
  const metadataUserId = String(metadata.user_id ?? "");
  const metadataBookId = String(metadata.book_id ?? "");

  if (metadataOrderId !== orderId || metadataUserId !== userId || metadataBookId !== bookId) {
    if (orderStatus === "pending") {
      await admin
        .from("orders" as never)
        .update({ status: "failed" })
        .eq("id", orderId)
        .eq("user_id", userId)
        .eq("status", "pending");
    }
    return "failed";
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
    // `status === "complete"` is the signal that the buyer finished Checkout.
    // An "open" session means they never paid at all, which keeps the original
    // fail-fast behaviour.
    if (session.payment_status === "unpaid" && session.status === "complete") {
      return "processing";
    }

    if (orderStatus === "pending") {
      await admin
        .from("orders" as never)
        .update({ status: "failed" })
        .eq("id", orderId)
        .eq("user_id", userId)
        .eq("status", "pending");
    }
    return "failed";
  }

  const { data: finalized, error: finalizeError } = await admin.rpc(
    "finalize_order_checkout_session" as never,
    {
      p_stripe_session_id: sessionId,
    },
  );

  if (finalizeError || finalized !== true) {
    return "failed";
  }

  if (orderStatus !== "paid") {
    await logAnalyticsEvent(admin, {
      eventType: "purchase_completed",
      userId,
      bookId,
      path: `/reader/books/${bookId}`,
      props: { provider: "stripe", orderId, chapterId: orderChapterId ?? undefined },
    });
  }

  return "paid";
}

export async function markOrderFailedForUser(orderId: string, userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("orders" as never)
    .update({ status: "failed" })
    .eq("id", orderId)
    .eq("user_id", userId)
    .eq("status", "pending");
}
