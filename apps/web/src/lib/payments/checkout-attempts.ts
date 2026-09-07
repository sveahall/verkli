import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripeCheckoutSession } from "@/lib/payments/stripe";
import { getPurchaseStatusUrl, isCheckoutIdentifier, isUsableCheckoutUrl } from "./checkout-status-url";

type AdminClient = ReturnType<typeof createAdminClient>;
type OwnedOrder = Record<string, unknown> & { id: string; user_id: string; book_id: string };
type Attempt = OwnedOrder & { stripe_session_id: string; amount: number; currency: string };
type GuardResult =
  | { status: "clear" }
  | { status: "reuse"; order: Attempt; checkoutUrl: string }
  | { status: "recorded" | "processing" | "unavailable" | "history_limit"; reason: string; purchaseStatusUrl?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOwnedWholeBookOrder(value: unknown, userId: string, bookId: string): value is OwnedOrder {
  return isRecord(value)
    && isCheckoutIdentifier(value.id)
    && value.user_id === userId
    && value.book_id === bookId
    && (!Object.hasOwn(value, "chapter_id") || value.chapter_id === null)
    && (value.status === "pending" || value.status === "failed" || value.status === "paid");
}

function isAttempt(value: OwnedOrder): value is Attempt {
  return value.provider === "stripe"
    && isCheckoutIdentifier(value.stripe_session_id)
    && Number.isSafeInteger(value.amount)
    && Number(value.amount) > 0
    && typeof value.currency === "string"
    && /^[A-Za-z]{3}$/.test(value.currency);
}

export function getOwnedPurchaseStatusUrl(value: unknown, userId: string, bookId: string): string | null {
  return isOwnedWholeBookOrder(value, userId, bookId) && isAttempt(value)
    ? getPurchaseStatusUrl(bookId, value.id, value.stripe_session_id) : null;
}

async function readOrders(admin: AdminClient, userId: string, bookId: string, paid: boolean) {
  const read = async (withChapter: boolean) => {
    let query = admin
      .from("orders" as never)
      .select("*")
      .eq("user_id", userId)
      .eq("book_id", bookId);
    query = paid ? query.eq("status", "paid") : query.in("status", ["pending", "failed"]);
    if (withChapter) query = query.is("chapter_id", null);
    if (!paid) {
      query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
    }
    return await query.limit(paid ? 1 : 26);
  };
  const result = await read(true);
  if (
    isRecord(result.error)
    && result.error.code === "42703"
    && result.error.message === "column orders.chapter_id does not exist"
  ) {
    return read(false);
  }
  return result;
}

function matchesSession(value: unknown, order: Attempt): value is Record<string, unknown> {
  if (!isRecord(value) || value.id !== order.stripe_session_id || !isRecord(value.metadata)) return false;
  const metadata = value.metadata;
  if (
    metadata.order_id !== order.id
    || metadata.user_id !== order.user_id
    || metadata.book_id !== order.book_id
  ) return false;
  for (const key of ["payment_type", "payment_kind"]) {
    if (Object.hasOwn(metadata, key) && metadata[key] !== "book_purchase") return false;
  }
  // A whole-book checkout does not emit chapter metadata. Any supplied chapter
  // scope, including malformed/empty values, needs independent verification.
  if (Object.hasOwn(metadata, "chapter_id")) return false;
  if (
    Object.hasOwn(value, "amount_total")
    && (!Number.isSafeInteger(value.amount_total) || value.amount_total !== order.amount)
  ) return false;
  if (
    Object.hasOwn(value, "currency")
    && (typeof value.currency !== "string"
      || !/^[A-Za-z]{3}$/.test(value.currency)
      || value.currency.toLowerCase() !== order.currency.toLowerCase())
  ) return false;
  return true;
}

/** No new checkout until every previous whole-book attempt is accounted for. */
export async function checkBookCheckoutAttempts(admin: AdminClient, userId: string, bookId: string): Promise<GuardResult> {
  try {
    // Paid ledger evidence blocks repayment even if access finalization failed,
    // the provider changed, the order is old, or its session binding is missing.
    const paid = await readOrders(admin, userId, bookId, true);
    if (paid.error !== null || !Array.isArray(paid.data) || paid.data.length > 1) {
      return { status: "unavailable", reason: "paid_order_lookup_unavailable" };
    }
    if (paid.data.length === 1) {
      const order: unknown = paid.data[0];
      if (!isOwnedWholeBookOrder(order, userId, bookId) || order.status !== "paid") {
        return { status: "unavailable", reason: "invalid_paid_order" };
      }
      const purchaseStatusUrl = getOwnedPurchaseStatusUrl(order, userId, bookId);
      return { status: "recorded", reason: "payment_recorded", ...(purchaseStatusUrl ? { purchaseStatusUrl } : {}) };
    }

    const history = await readOrders(admin, userId, bookId, false);
    if (history.error !== null || !Array.isArray(history.data)) {
      return { status: "unavailable", reason: "attempt_lookup_unavailable" };
    }
    if (history.data.length > 25) return { status: "history_limit", reason: "history_verification_limit" };

    const attempts: Attempt[] = [];
    for (const row of history.data as unknown[]) {
      if (!isOwnedWholeBookOrder(row, userId, bookId) || (row.status !== "pending" && row.status !== "failed")) {
        return { status: "unavailable", reason: "invalid_attempt_identity" };
      }
      if (row.stripe_session_id === null) return { status: "processing", reason: "attempt_session_unbound" };
      if (!isAttempt(row)) return { status: "unavailable", reason: "invalid_attempt_shape" };
      if (attempts.some((attempt) => attempt.id === row.id)) {
        return { status: "unavailable", reason: "duplicate_attempt_identity" };
      }
      attempts.push(row);
    }
    const purchaseStatusUrl = attempts.length === 1
      ? getPurchaseStatusUrl(bookId, attempts[0].id, attempts[0].stripe_session_id) : null;
    const processing = (reason: string): GuardResult => ({
      status: "processing",
      reason,
      ...(purchaseStatusUrl ? { purchaseStatusUrl } : {}),
    });
    const terminal: Attempt[] = [];
    const open: Array<{ order: Attempt; checkoutUrl: string }> = [];
    for (const order of attempts) {
      let session: unknown;
      try {
        session = await getStripeCheckoutSession(order.stripe_session_id);
      } catch {
        return processing("session_verification_unavailable");
      }
      if (!matchesSession(session, order)) return processing("session_identity_or_scope_unverified");
      if (session.status === "expired" && session.payment_status === "unpaid") {
        terminal.push(order);
      } else if (session.status === "open" && session.payment_status === "unpaid" && isUsableCheckoutUrl(session.url)) {
        open.push({ order, checkoutUrl: session.url });
      } else {
        return processing("session_payment_unresolved");
      }
    }
    if (open.length > 1) return processing("multiple_open_sessions");

    // Verify a conditional write on this request even for an already-failed row.
    // A paid claim or session rebinding racing verification must stop checkout.
    for (const order of terminal) {
      try {
        const { data, error } = await admin
          .from("orders" as never)
          .update({ status: "failed" })
          .eq("id", order.id)
          .eq("user_id", userId)
          .eq("book_id", bookId)
          .eq("stripe_session_id", order.stripe_session_id)
          .in("status", ["pending", "failed"])
          .select("id")
          .maybeSingle();
        const affected: unknown = data;
        if (error !== null || !isRecord(affected) || affected.id !== order.id) return processing("terminal_write_unconfirmed");
      } catch {
        return processing("terminal_write_unconfirmed");
      }
    }
    return open.length === 1 ? { status: "reuse", ...open[0] } : { status: "clear" };
  } catch {
    return { status: "unavailable", reason: "order_verification_unavailable" };
  }
}
