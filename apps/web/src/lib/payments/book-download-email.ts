import "server-only";
import { Resend } from "resend";
import { TA_FOR_ER_ORDER } from "@/lib/orders/ta-for-er";
import type { createAdminClient } from "@/lib/supabase/admin";

/** Called only for signature-verified completed/succeeded checkout events. */
export async function sendBookDownloadEmail(
  admin: ReturnType<typeof createAdminClient>,
  session: Record<string, unknown>,
): Promise<void> {
  // Share eligibility between ordinary processing and stranded-claim recovery.
  const metadata = session.metadata as Record<string, unknown> | null;
  if (
    session.payment_status !== "paid" ||
    metadata?.payment_kind !== "book_order" ||
    metadata.order_variant !== "ebook"
  ) return;

  const sessionId = typeof session.id === "string" ? session.id.trim() : "";
  if (!sessionId) throw new Error("[book download] Missing paid order session ID");

  // This namespaced row is an application acceptance receipt, not a Stripe
  // event or proof of inbox delivery. Generic rollback only deletes evt_ IDs.
  const markerId = `book-download-email:${sessionId}`;
  const { data: accepted, error: readError } = await admin
    .from("stripe_events")
    .select("stripe_event_id")
    .eq("stripe_event_id", markerId)
    .maybeSingle();
  if (readError) {
    throw new Error(`[book download] Acceptance marker read failed (${readError.code}): ${readError.message}`);
  }
  if (accepted) return;

  const key = process.env.RESEND_API_KEY?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
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
  const { data, error } = await new Resend(key).emails.send({
    from: process.env.RESEND_FROM_EMAIL?.trim() || "Verkli <noreply@verkli.com>",
    to: email,
    subject: `Din e-bok: ${TA_FOR_ER_ORDER.bookTitle}`,
    text,
    html: `<h1>Tack för ditt köp!</h1><p>${TA_FOR_ER_ORDER.bookTitle} av ${TA_FOR_ER_ORDER.authorName}</p><p><a href="${href}">Ladda ner din bok</a></p><p>Spara det här mejlet så att du kan hämta boken igen. Länken är personlig.</p><p>Verkli</p>`,
  }, { idempotencyKey: `book-download/${sessionId}` });

  // Throw so the webhook rolls back its event claim and Stripe can retry.
  // Acknowledging an email failure would permanently lose the delivery link.
  if (error) throw new Error(`[book download] Delivery email failed: ${error.message}`);
  if (!data?.id) throw new Error("[book download] Delivery email acceptance was not confirmed");

  // Acceptance and this write cannot be atomic. If acceptance is unrecorded,
  // retries retain the same provider key, but after its 24-hour retention a
  // resend can duplicate the email. Such old uncertain attempts need provider
  // reconciliation/manual handling; this does not guarantee exactly-once mail.
  const { error: writeError } = await admin.from("stripe_events").insert({
    stripe_event_id: markerId,
    type: "book_download_email.accepted",
  });
  if (writeError && writeError.code !== "23505") {
    throw new Error(`[book download] Acceptance marker write failed (${writeError.code}): ${writeError.message}`);
  }
  console.info("[book download] delivery email accepted");
}
