/**
 * Purchase receipt delivery, and the exactly-once guard around it.
 *
 * ## Why a claim is needed
 *
 * Two independent code paths finalize the same book purchase:
 *
 *  - the Stripe webhook (`checkout.session.completed` /
 *    `checkout.session.async_payment_succeeded`), which Stripe may deliver more
 *    than once; and
 *  - `/reader/books/[id]/purchase/success`, which confirms the purchase itself
 *    so the buyer gets access even when the webhook is down — and which re-runs
 *    on every page reload.
 *
 * `finalize_order_checkout_session` cannot arbitrate between them: it returns
 * `true` whenever the order row exists, whether or not it changed anything. So
 * "did the RPC succeed" is not a signal that *this* caller was the one that
 * completed the purchase, and using it to gate the email would send one receipt
 * per webhook delivery plus one per page reload.
 *
 * ## The claim
 *
 * `claimPaidOrderForReceipt` performs the `pending`/`failed` → `paid`
 * transition itself, as a single conditional UPDATE. Postgres serialises
 * concurrent updates of a row, and the loser re-evaluates the `WHERE` clause
 * against the committed new version — so of any number of racing callers,
 * exactly one gets a row back. That row is the receipt token.
 *
 * The transition is the same write the RPC would have made, and it only happens
 * after the caller has verified with Stripe that the session is genuinely paid,
 * so claiming early cannot mark an unpaid order paid. A `processing` (delayed)
 * payment never reaches here.
 *
 * If the RPC then fails, the order is `paid` with no entitlement yet. That heals
 * on the next webhook retry or success-page load, both of which re-run the RPC.
 * We deliberately do not roll the status back: downgrading a paid order is worse
 * than a delayed entitlement, and the receipt is only sent once the RPC has
 * confirmed.
 */

import "server-only";

import { Resend } from "resend";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPurchaseReceiptHtml,
  buildPurchaseReceiptSubject,
  buildPurchaseReceiptText,
} from "@/lib/emails/purchase-receipt";

type AdminClient = ReturnType<typeof createAdminClient>;

export type PaidOrderReceiptClaim = {
  orderId: string;
  userId: string;
  bookId: string;
  chapterId: string | null;
  amountMinor: number;
  currency: string;
  stripeSessionId: string;
  createdAt: string | null;
};

/**
 * Atomically take ownership of the `pending`/`failed` → `paid` transition for a
 * Stripe session.
 *
 * @returns the claimed order when this caller won the race, `null` when someone
 *   else already finalized it (or there is no such order). `null` means **do
 *   not send a receipt**.
 */
export async function claimPaidOrderForReceipt(
  admin: AdminClient,
  stripeSessionId: string
): Promise<PaidOrderReceiptClaim | null> {
  const sessionId = stripeSessionId.trim();
  if (!sessionId) return null;

  const { data, error } = await admin
    .from("orders" as never)
    .update({ status: "paid" })
    .eq("stripe_session_id", sessionId)
    .in("status", ["pending", "failed"])
    .select("id, user_id, book_id, chapter_id, amount, currency, created_at")
    .maybeSingle();

  if (error) {
    // Never fail the purchase over a receipt. The RPC that follows still runs
    // and still grants access; the buyer just does not get an email.
    console.error("[purchase.receipt] claim failed", {
      sessionId,
      code: error.code,
      message: error.message,
    });
    return null;
  }

  if (!data) return null;

  const row = data as Record<string, unknown>;
  const amount = typeof row.amount === "number" ? row.amount : Number(row.amount ?? NaN);
  if (!Number.isFinite(amount)) {
    console.warn("[purchase.receipt] claimed order has no usable amount", {
      sessionId,
      orderId: String(row.id ?? ""),
    });
    return null;
  }

  return {
    orderId: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    bookId: String(row.book_id ?? ""),
    chapterId: typeof row.chapter_id === "string" ? row.chapter_id : null,
    amountMinor: amount,
    currency: String(row.currency ?? "SEK"),
    stripeSessionId: sessionId,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

async function loadReceiptContext(
  admin: AdminClient,
  claim: PaidOrderReceiptClaim
): Promise<{
  buyerEmail: string | null;
  bookTitle: string;
  authorName: string | null;
  chapterTitle: string | null;
}> {
  const [{ data: book }, buyer, chapter] = await Promise.all([
    admin.from("books").select("title, author_id").eq("id", claim.bookId).maybeSingle(),
    admin.auth.admin.getUserById(claim.userId),
    claim.chapterId
      ? admin.from("chapters").select("title").eq("id", claim.chapterId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const authorId = (book as { author_id?: string } | null)?.author_id ?? null;
  let authorName: string | null = null;
  if (authorId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, username")
      .eq("user_id", authorId)
      .maybeSingle();
    const named = profile as { display_name?: string | null; username?: string | null } | null;
    authorName = named?.display_name?.trim() || named?.username?.trim() || null;
  }

  return {
    buyerEmail:
      (buyer?.data?.user as { email?: string | null } | null)?.email?.trim() || null,
    bookTitle: String((book as { title?: string } | null)?.title ?? "Your book"),
    authorName,
    chapterTitle:
      ((chapter as { data?: { title?: string | null } | null } | null)?.data?.title ?? null) ||
      null,
  };
}

/**
 * Send the receipt for a claimed order. Fire-and-forget: logs on failure and
 * never throws, so a broken email provider can never roll back a paid purchase.
 *
 * Only ever call this with a claim returned by `claimPaidOrderForReceipt`.
 */
export async function sendPurchaseReceipt(
  admin: AdminClient,
  claim: PaidOrderReceiptClaim
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() || "Verkli <noreply@verkli.com>";

  if (!resendKey) {
    console.warn("[purchase.receipt] skipped: RESEND_API_KEY not set", {
      orderId: claim.orderId,
    });
    return;
  }

  try {
    const context = await loadReceiptContext(admin, claim);
    if (!context.buyerEmail) {
      console.warn("[purchase.receipt] skipped: buyer has no email on file", {
        orderId: claim.orderId,
        userId: claim.userId,
      });
      return;
    }

    const options = {
      bookTitle: context.bookTitle,
      authorName: context.authorName,
      amountMinor: claim.amountMinor,
      currency: claim.currency,
      orderId: claim.orderId,
      purchasedAt: claim.createdAt,
      chapterTitle: context.chapterTitle,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    };

    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from,
      to: context.buyerEmail,
      subject: buildPurchaseReceiptSubject(options),
      html: buildPurchaseReceiptHtml(options),
      text: buildPurchaseReceiptText(options),
    });

    if (error) {
      console.error("[purchase.receipt] send failed", {
        orderId: claim.orderId,
        message: error.message,
      });
      return;
    }

    console.info("[purchase.receipt] sent", {
      orderId: claim.orderId,
      bookId: claim.bookId,
    });
  } catch (err) {
    console.error("[purchase.receipt] send threw", {
      orderId: claim.orderId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
