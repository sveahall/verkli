import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeCheckoutSession } from "@/lib/payments/stripe";
import { logAnalyticsEvent } from "@/lib/analytics/events";

type ConfirmStripePodPurchaseArgs = {
  podOrderId: string;
  sessionId: string;
  userId: string;
  bookId: string;
};

export async function confirmStripePodPurchase({
  podOrderId,
  sessionId,
  userId,
  bookId,
}: ConfirmStripePodPurchaseArgs): Promise<boolean> {
  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("pod_orders" as never)
    .select("id, user_id, book_id, status, amount, currency, format")
    .eq("id", podOrderId)
    .maybeSingle();

  if (orderError || !order) {
    return false;
  }

  const orderUserId = String((order as { user_id?: string }).user_id ?? "");
  const orderBookId = String((order as { book_id?: string }).book_id ?? "");
  const orderStatus = String((order as { status?: string }).status ?? "");

  if (orderUserId !== userId || orderBookId !== bookId) {
    return false;
  }

  if (orderStatus === "paid") {
    return true;
  }

  const session = await getStripeCheckoutSession(sessionId);
  const metadata = session.metadata ?? {};

  const metaPodOrderId = String(metadata.pod_order_id ?? "");
  const metaUserId = String(metadata.user_id ?? "");
  const metaBookId = String(metadata.book_id ?? "");

  if (metaPodOrderId !== podOrderId || metaUserId !== userId || metaBookId !== bookId) {
    if (orderStatus === "pending") {
      await admin
        .from("pod_orders" as never)
        .update({ status: "failed" })
        .eq("id", podOrderId)
        .eq("user_id", userId)
        .eq("status", "pending");
    }
    return false;
  }

  if (session.payment_status !== "paid") {
    if (orderStatus === "pending") {
      await admin
        .from("pod_orders" as never)
        .update({ status: "failed" })
        .eq("id", podOrderId)
        .eq("user_id", userId)
        .eq("status", "pending");
    }
    return false;
  }

  // Mark as paid and store shipping address from Stripe session
  const shippingDetails = (session as Record<string, unknown>).shipping_details ?? null;

  const { error: updateError } = await admin
    .from("pod_orders" as never)
    .update({
      status: "paid",
      shipping_address: shippingDetails,
    })
    .eq("id", podOrderId)
    .eq("user_id", userId)
    .eq("status", "pending");

  if (updateError) {
    return false;
  }

  await logAnalyticsEvent(admin, {
    eventType: "pod_purchase_completed",
    userId,
    bookId,
    path: `/reader/books/${bookId}`,
    props: {
      provider: "stripe",
      podOrderId,
      format: String((order as { format?: string }).format ?? ""),
    },
  });

  return true;
}

export async function markPodOrderFailedForUser(podOrderId: string, userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("pod_orders" as never)
    .update({ status: "failed" })
    .eq("id", podOrderId)
    .eq("user_id", userId)
    .eq("status", "pending");
}
