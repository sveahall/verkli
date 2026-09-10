/**
 * Single source of truth for the standalone "Ta för er!" physical-book order.
 *
 * This is an anonymous order (no auth, no DB row): the buyer fills in a
 * shipping address on the waitlist page and pays via a Stripe Checkout
 * session. The shipping address rides along in the Stripe session metadata so
 * the order is fully actionable from the Stripe Dashboard.
 *
 * Reaches the browser: `waitlist/BookOrderSection.tsx` is a client component and
 * imports this, so every field here ships in the client bundle. It is also read
 * by middleware and by the API route. Keep it public product facts only — an
 * internal SKU, a cost price or a Stripe price id added here would leak to the
 * browser with nothing to signal it.
 */
export const TA_FOR_ER_ORDER = {
  /**
   * URL segment for this product's order routes. The middleware site locks
   * allow `/order/<slug>` and `/api/order/<slug>` through by reading this, so
   * it MUST match the route directory names under `app/order` and
   * `app/api/order`. A product whose slug is not registered stays locked.
   */
  slug: "ta-for-er",
  bookTitle: "Ta för er!",
  authorName: "Johan SvH",
  /** Price in minor units (öre). 249 kr, shipping included. */
  priceMinor: 24900,
  currency: "SEK",
  priceLabel: "249 kr",
} as const;

/** Product name shown on the Stripe Checkout line item and receipt. */
export const TA_FOR_ER_PRODUCT_NAME = `${TA_FOR_ER_ORDER.bookTitle} — ${TA_FOR_ER_ORDER.authorName} (frakt ingår)`;

/**
 * The same book as a download, 75 kr.
 *
 * Sold through the same slug and the same anonymous Stripe Checkout as the
 * printed copy — no account, no DB row — because BETA_LOCK keeps the reader
 * app shut and a buyer must not have to get past it to read what they paid
 * for. The distinction between the two rides in the Stripe session metadata
 * as `order_variant`, which the success page and the download route both
 * check: a print session must never unlock a file, and an ebook session must
 * never claim something is in the post.
 *
 * Delivery is a short-lived signed URL from a PRIVATE storage bucket, issued
 * only after Stripe confirms the session is paid. Nothing is emailed yet, so
 * the success page is currently the only way to the file — see the note in
 * api/order/ta-for-er/download/route.ts.
 */
export const TA_FOR_ER_EBOOK = {
  /** Price in minor units (öre). 75 kr, no shipping. */
  priceMinor: 7500,
  currency: "SEK",
  priceLabel: "75 kr",
} as const;

/**
 * Formats the buyer may choose between. The buyer picks; both come with the
 * one purchase, so there is nothing to upsell and no wrong choice.
 *
 * A format only appears once its file exists in the bucket, so this list can
 * name a format that is not deliverable yet without showing a dead button.
 * `path` is inside the private `book-downloads` bucket.
 */
export const TA_FOR_ER_EBOOK_FORMATS = [
  {
    id: "pdf",
    label: "PDF",
    hint: "Läser bäst på dator och läsplatta.",
    path: "ta-for-er/ta-for-er.pdf",
    contentType: "application/pdf",
  },
  {
    id: "epub",
    label: "EPUB",
    hint: "Läser bäst i mobil och i läsappar.",
    path: "ta-for-er/ta-for-er.epub",
    contentType: "application/epub+zip",
  },
] as const;

export type TaForErEbookFormatId = (typeof TA_FOR_ER_EBOOK_FORMATS)[number]["id"];

/** Private bucket. Never make this public — the file is the product. */
export const TA_FOR_ER_DOWNLOAD_BUCKET = "book-downloads";

/** Product name on the Stripe Checkout line item and receipt. */
export const TA_FOR_ER_EBOOK_PRODUCT_NAME = `${TA_FOR_ER_ORDER.bookTitle} — ${TA_FOR_ER_ORDER.authorName} (e-bok)`;
