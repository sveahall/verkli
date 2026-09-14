import "server-only";
import { Resend } from "resend";
import { TA_FOR_ER_ORDER } from "@/lib/orders/ta-for-er";

/** Called only for a paid e-book order from the verified Stripe webhook. */
export async function sendBookDownloadEmail(session: Record<string, unknown>): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const sessionId = typeof session.id === "string" ? session.id.trim() : "";
  const details = session.customer_details as { email?: unknown } | null;
  const email = typeof details?.email === "string" ? details.email.trim()
    : typeof session.customer_email === "string" ? session.customer_email.trim() : "";

  if (!key || !siteUrl || !sessionId || !email) {
    throw new Error("[book download] Missing email configuration or paid order delivery details");
  }

  // Link to the entitlement-checking page, never to an expiring storage URL.
  // Use our configured origin, not a destination supplied in Stripe metadata.
  const url = new URL(`/order/${TA_FOR_ER_ORDER.slug}/success`, siteUrl);
  url.searchParams.set("session_id", sessionId);
  const href = url.toString().replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const text = `Tack för ditt köp!\n\n${TA_FOR_ER_ORDER.bookTitle} av ${TA_FOR_ER_ORDER.authorName}\n\nLadda ner din bok:\n${url.toString()}\n\nSpara det här mejlet så att du kan hämta boken igen. Länken är personlig.\n\nVerkli`;
  const { error } = await new Resend(key).emails.send({
    from: process.env.RESEND_FROM_EMAIL?.trim() || "Verkli <noreply@verkli.com>",
    to: email,
    subject: `Din e-bok: ${TA_FOR_ER_ORDER.bookTitle}`,
    text,
    html: `<h1>Tack för ditt köp!</h1><p>${TA_FOR_ER_ORDER.bookTitle} av ${TA_FOR_ER_ORDER.authorName}</p><p><a href="${href}">Ladda ner din bok</a></p><p>Spara det här mejlet så att du kan hämta boken igen. Länken är personlig.</p><p>Verkli</p>`,
  }, { idempotencyKey: `book-download/${sessionId}` });

  // Throw so the webhook rolls back its event claim and Stripe can retry.
  // Acknowledging an email failure would permanently lose the delivery link.
  if (error) throw new Error(`[book download] Delivery email failed: ${error.message}`);
  console.info("[book download] delivery email accepted");
}
