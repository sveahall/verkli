import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeCheckoutSession } from "@/lib/payments/stripe";
import { logAnalyticsEvent } from "@/lib/analytics/events";

type ConfirmStripePurchaseArgs = {
  orderId: string;
  sessionId: string;
  userId: string;
  bookId: string;
};

function normalizeCurrency(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

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

  if (orderStatus === "paid") {
    if (orderChapterId) {
      await admin
        .from("entitlements" as never)
        .insert({ user_id: userId, book_id: bookId, chapter_id: orderChapterId, source: "purchase" })
        .then(() => {});
    } else {
      await admin
        .from("entitlements" as never)
        .insert({ user_id: userId, book_id: bookId, source: "purchase" })
        .then(() => {});
    }
    return true;
  }

  const session = await getStripeCheckoutSession(sessionId);
  const metadata = session.metadata ?? {};

  const metadataOrderId = String(metadata.order_id ?? "");
  const metadataUserId = String(metadata.user_id ?? "");
  const metadataBookId = String(metadata.book_id ?? "");

  if (metadataOrderId !== orderId || metadataUserId !== userId || metadataBookId !== bookId) {
    await admin
      .from("orders" as never)
      .update({ status: "failed" })
      .eq("id", orderId)
      .eq("user_id", userId);
    return false;
  }

  if (session.payment_status !== "paid") {
    await admin
      .from("orders" as never)
      .update({ status: "failed" })
      .eq("id", orderId)
      .eq("user_id", userId);
    return false;
  }

  const amount = typeof session.amount_total === "number" ? Math.max(0, Math.trunc(session.amount_total)) : null;
  const currency = normalizeCurrency(session.currency);

  const paidTransition = await admin
    .from("orders" as never)
    .update({
      status: "paid",
      ...(amount != null ? { amount } : {}),
      ...(currency ? { currency } : {}),
    })
    .eq("id", orderId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  const paidOrder = paidTransition.data as { id?: string } | null;
  const paidOrderError = paidTransition.error;

  if (paidOrderError) {
    return false;
  }

  // Create entitlement — book-level or chapter-level based on order
  const entitlementPayload: Record<string, string> = {
    user_id: userId,
    book_id: bookId,
    source: "purchase",
  };
  if (orderChapterId) {
    entitlementPayload.chapter_id = orderChapterId;
  }

  const { error: entitlementError } = await admin
    .from("entitlements" as never)
    .insert(entitlementPayload);

  if (paidOrder?.id) {
    await logAnalyticsEvent(admin, {
      eventType: "purchase_completed",
      userId,
      bookId,
      path: `/reader/books/${bookId}`,
      props: { provider: "stripe", orderId, chapterId: orderChapterId ?? undefined },
    });
  }

  return !entitlementError;
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
