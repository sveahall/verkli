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
