/**
 * Manual POD fulfillment notification.
 *
 * When a POD order transitions to `paid`, email the configured operator
 * address with the full order + shipping details so the order can be placed
 * with a print vendor by hand. A real vendor integration (Lulu/IngramSpark/
 * BookVault) is intentionally out of scope for MVP.
 */

import { Resend } from "resend";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type ShippingAddress = {
  name?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    postal_code?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
};

export type PodFulfillmentNotification = {
  podOrderId: string;
  bookId: string;
  userId: string;
  format: string | null;
  amountMinor: number | null;
  currency: string | null;
  stripeSessionId: string | null;
  shippingAddress: ShippingAddress | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAmount(amountMinor: number | null, currency: string | null): string {
  if (amountMinor == null || !currency) return "—";
  const major = amountMinor / 100;
  return `${major.toFixed(2)} ${currency.toUpperCase()}`;
}

function formatShipping(address: ShippingAddress | null): string {
  if (!address) return "No shipping details captured.";
  const lines: string[] = [];
  if (address.name) lines.push(address.name);
  const addr = address.address ?? null;
  if (addr?.line1) lines.push(addr.line1);
  if (addr?.line2) lines.push(addr.line2);
  const cityLine = [addr?.postal_code, addr?.city].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  if (addr?.state) lines.push(addr.state);
  if (addr?.country) lines.push(addr.country);
  return lines.length ? lines.join("\n") : "No shipping details captured.";
}

async function loadBookAndAuthor(
  admin: AdminClient,
  bookId: string,
  userId: string,
): Promise<{ bookTitle: string; authorEmail: string | null; buyerEmail: string | null }> {
  const { data: book } = await admin
    .from("books")
    .select("title, user_id")
    .eq("id", bookId)
    .maybeSingle();

  const [{ data: author }, { data: buyer }] = await Promise.all([
    book?.user_id
      ? admin.auth.admin.getUserById(String(book.user_id))
      : Promise.resolve({ data: null }),
    admin.auth.admin.getUserById(userId),
  ]);

  return {
    bookTitle: String((book as { title?: string } | null)?.title ?? "Unknown book"),
    authorEmail:
      (author?.user as { email?: string | null } | null)?.email?.trim() || null,
    buyerEmail:
      (buyer?.user as { email?: string | null } | null)?.email?.trim() || null,
  };
}

/**
 * Fire-and-forget notification. Logs on failure but never throws — a
 * missing/broken email provider must not prevent the webhook from marking
 * the order paid.
 */
export async function notifyPodFulfillment(
  admin: AdminClient,
  order: PodFulfillmentNotification,
): Promise<void> {
  const operatorTo =
    process.env.POD_FULFILLMENT_EMAIL?.trim() ||
    process.env.SUPPORT_EMAIL?.trim() ||
    "";
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Verkli <noreply@verkli.com>";

  if (!resendKey || !operatorTo) {
    console.warn("[pod.fulfillment] email skipped: missing RESEND_API_KEY or POD_FULFILLMENT_EMAIL", {
      podOrderId: order.podOrderId,
    });
    return;
  }

  let bookTitle = "Unknown book";
  let authorEmail: string | null = null;
  let buyerEmail: string | null = null;
  try {
    const loaded = await loadBookAndAuthor(admin, order.bookId, order.userId);
    bookTitle = loaded.bookTitle;
    authorEmail = loaded.authorEmail;
    buyerEmail = loaded.buyerEmail;
  } catch (err) {
    console.warn("[pod.fulfillment] failed to load book/author metadata", {
      podOrderId: order.podOrderId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const subject = `[POD] New paid order: ${bookTitle}`;
  const shippingText = formatShipping(order.shippingAddress);
  const html =
    `<h2>New paid POD order</h2>` +
    `<p><strong>Book:</strong> ${escapeHtml(bookTitle)}</p>` +
    `<p><strong>Format:</strong> ${escapeHtml(order.format ?? "—")}</p>` +
    `<p><strong>Amount:</strong> ${escapeHtml(formatAmount(order.amountMinor, order.currency))}</p>` +
    `<p><strong>POD order ID:</strong> <code>${escapeHtml(order.podOrderId)}</code></p>` +
    (order.stripeSessionId
      ? `<p><strong>Stripe session:</strong> <code>${escapeHtml(order.stripeSessionId)}</code></p>`
      : "") +
    `<p><strong>Buyer:</strong> ${escapeHtml(buyerEmail ?? order.userId)}</p>` +
    (authorEmail
      ? `<p><strong>Author:</strong> ${escapeHtml(authorEmail)}</p>`
      : "") +
    `<h3>Shipping</h3>` +
    `<pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;background:#f8fafc;padding:12px;border-radius:6px">${escapeHtml(shippingText)}</pre>` +
    `<p style="color:#64748b;font-size:12px">MVP fulfillment is manual — place this order with the print vendor and update <code>pod_orders.status</code> to <code>shipped</code> when done.</p>`;

  const text =
    `New paid POD order\n\n` +
    `Book: ${bookTitle}\n` +
    `Format: ${order.format ?? "—"}\n` +
    `Amount: ${formatAmount(order.amountMinor, order.currency)}\n` +
    `POD order ID: ${order.podOrderId}\n` +
    (order.stripeSessionId ? `Stripe session: ${order.stripeSessionId}\n` : "") +
    `Buyer: ${buyerEmail ?? order.userId}\n` +
    (authorEmail ? `Author: ${authorEmail}\n` : "") +
    `\nShipping:\n${shippingText}\n`;

  try {
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from,
      to: operatorTo,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error("[pod.fulfillment] email send failed", {
      podOrderId: order.podOrderId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
