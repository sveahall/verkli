/**
 * Book purchase receipt.
 *
 * Until this existed, the only transactional email a reader ever received was
 * the waitlist confirmation: someone could pay for a book and end up with no
 * artefact at all showing what they had bought. A receipt is the buyer's proof
 * of purchase and their route back into the product.
 */

import { formatMoney } from "@/lib/format-money";

export type PurchaseReceiptEmailOptions = {
  bookTitle: string;
  authorName?: string | null;
  /** Amount in minor units (öre/cents), as stored on `orders.amount`. */
  amountMinor: number;
  /** ISO 4217 code, as stored on `orders.currency`. */
  currency: string;
  orderId: string;
  purchasedAt?: Date | string | null;
  /** Set for a single-chapter purchase so the receipt does not overstate it. */
  chapterTitle?: string | null;
  /** Overridable so the link works outside production. */
  siteUrl?: string | null;
};

const DEFAULT_SITE_URL = "https://www.verkli.com";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeSiteUrl(siteUrl?: string | null): string {
  const trimmed = typeof siteUrl === "string" ? siteUrl.trim() : "";
  if (!trimmed) return DEFAULT_SITE_URL;
  return trimmed.replace(/\/+$/, "");
}

function formatReceiptDate(value?: Date | string | null): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function buildPurchaseReceiptSubject(
  options: PurchaseReceiptEmailOptions
): string {
  return `Your Verkli receipt — ${options.bookTitle}`;
}

/**
 * Plain-text alternative. Some clients (and every spam filter) prefer one.
 */
export function buildPurchaseReceiptText(
  options: PurchaseReceiptEmailOptions
): string {
  const site = normalizeSiteUrl(options.siteUrl);
  const date = formatReceiptDate(options.purchasedAt);
  const lines = [
    "Thank you for your purchase.",
    "",
    `Book: ${options.bookTitle}`,
  ];
  if (options.chapterTitle) lines.push(`Chapter: ${options.chapterTitle}`);
  if (options.authorName) lines.push(`Author: ${options.authorName}`);
  lines.push(`Total: ${formatMoney(options.amountMinor, options.currency)}`);
  if (date) lines.push(`Date: ${date}`);
  lines.push(`Order: ${options.orderId}`);
  lines.push("");
  lines.push(`Your library: ${site}/reader/library`);
  lines.push("");
  lines.push("Keep this email as your receipt.");
  lines.push("The Verkli team");
  return lines.join("\n");
}

export function buildPurchaseReceiptHtml(
  options: PurchaseReceiptEmailOptions
): string {
  const site = normalizeSiteUrl(options.siteUrl);
  const date = formatReceiptDate(options.purchasedAt);
  const total = formatMoney(options.amountMinor, options.currency);

  const rows: Array<[string, string]> = [["Book", options.bookTitle]];
  if (options.chapterTitle) rows.push(["Chapter", options.chapterTitle]);
  if (options.authorName) rows.push(["Author", options.authorName]);
  if (date) rows.push(["Date", date]);
  rows.push(["Order", options.orderId]);
  rows.push(["Total", total]);

  const rowsHtml = rows
    .map(
      ([label, value], index) => `
                    <tr>
                      <td style="padding:${index === 0 ? "0" : "10px"} 0 0 0;font-size:13px;color:rgba(13,11,18,0.4);">${escapeHtml(label)}</td>
                      <td align="right" style="padding:${index === 0 ? "0" : "10px"} 0 0 0;font-size:13px;color:#0d0b12;font-variant-numeric:tabular-nums;">${escapeHtml(value)}</td>
                    </tr>`
    )
    .join("");

  return buildEmailHtml({
    headline: "Thank you for your purchase.",
    subheading: "Receipt for your Verkli order",
    bodyHtml: `
        <p style="margin:0 0 24px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">
          ${escapeHtml(options.bookTitle)} is now in your library, on every device you sign in to.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:1px solid rgba(13,11,18,0.08);border-bottom:1px solid rgba(13,11,18,0.08);padding:0;">
          <tr>
            <td style="padding:20px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rowsHtml}
              </table>
            </td>
          </tr>
        </table>
      `,
    ctaLabel: "Open your library",
    ctaHref: `${site}/reader/library`,
    footerHtml: `
        <p style="margin:0 0 6px 0;font-size:12px;line-height:1.6;color:rgba(13,11,18,0.32);">Keep this email as your receipt.</p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:rgba(13,11,18,0.32);">The Verkli team</p>
      `,
  });
}

function buildEmailHtml(opts: {
  headline: string;
  subheading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaHref: string;
  footerHtml: string;
}): string {
  const { headline, subheading, bodyHtml, ctaLabel, ctaHref, footerHtml } = opts;

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verkli — ${escapeHtml(headline)}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" />
  </head>
  <body style="margin:0;padding:0;background-color:#f4f3f5;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#f4f3f5;">
      <tr>
        <td align="center" style="padding:48px 24px 64px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:500px;border-collapse:collapse;">
            <tr>
              <td style="border-radius:16px;background-color:#ffffff;padding:48px 44px 40px;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                  <tr>
                    <td align="center" style="padding-bottom:32px;">
                      <img src="https://www.verkli.com/logo-dark.svg" width="90" height="22" alt="Verkli" style="display:block;" />
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:4px;">
                      <h1 style="margin:0;font-size:28px;line-height:1.2;color:#0d0b12;font-family:Georgia,'Times New Roman',serif;font-weight:400;letter-spacing:-0.02em;">${escapeHtml(headline)}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top:12px;padding-bottom:36px;">
                      <p style="margin:0;font-size:13px;color:rgba(13,11,18,0.4);letter-spacing:0.01em;">${escapeHtml(subheading)}</p>
                    </td>
                  </tr>
                  <tr>
                    <td>${bodyHtml}</td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top:32px;">
                      <a href="${ctaHref}" style="display:inline-block;padding:12px 36px;background-color:#0d0b12;color:#ffffff;border-radius:8px;font-size:13px;font-weight:500;text-align:center;text-decoration:none;letter-spacing:0.01em;">${escapeHtml(ctaLabel)}</a>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top:28px;">${footerHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}
