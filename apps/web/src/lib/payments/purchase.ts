import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeCheckoutSession } from "@/lib/payments/stripe";
import { logAnalyticsEvent } from "@/lib/analytics/events";

type ConfirmStripePurchaseArgs = {
  orderId: string;
  sessionId: string;
  userId: string;
  bookId: string;
};

export async function confirmStripeBookPurchase({
  orderId,
  sessionId,
  userId,
  bookId,
}: ConfirmStripePurchaseArgs): Promise<boolean> {
  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders" as never)
    .select("id, user_id, book_id, chapter_id, status, amount, currency")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return false;
  }

  const orderUserId = String((order as { user_id?: string }).user_id ?? "");
  const orderBookId = String((order as { book_id?: string }).book_id ?? "");
  const orderStatus = String((order as { status?: string }).status ?? "");
  const orderChapterId = (order as { chapter_id?: string | null }).chapter_id ?? null;

  if (orderUserId !== userId || orderBookId !== bookId) {
    return false;
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
    return false;
  }

  if (session.payment_status !== "paid") {
    if (orderStatus === "pending") {
      await admin
        .from("orders" as never)
        .update({ status: "failed" })
        .eq("id", orderId)
        .eq("user_id", userId)
        .eq("status", "pending");
    }
    return false;
  }

  const { data: finalized, error: finalizeError } = await admin.rpc(
    "finalize_order_checkout_session" as never,
    {
      p_stripe_session_id: sessionId,
    },
  );

  if (finalizeError || finalized !== true) {
    return false;
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

  return true;
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
