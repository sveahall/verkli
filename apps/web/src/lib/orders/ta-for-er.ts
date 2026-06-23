/**
 * Single source of truth for the standalone "Ta för er!" physical-book order.
 *
 * This is an anonymous order (no auth, no DB row): the buyer fills in a
 * shipping address on the waitlist page and pays via a Stripe Checkout
 * session. The shipping address rides along in the Stripe session metadata so
 * the order is fully actionable from the Stripe Dashboard.
 */
export const TA_FOR_ER_ORDER = {
  bookTitle: "Ta för er!",
  authorName: "Johan Staël von Holstein",
  /** Price in minor units (öre). 249 kr, shipping included. */
  priceMinor: 24900,
  currency: "SEK",
  priceLabel: "249 kr",
} as const;

/** Product name shown on the Stripe Checkout line item and receipt. */
export const TA_FOR_ER_PRODUCT_NAME = `${TA_FOR_ER_ORDER.bookTitle} — ${TA_FOR_ER_ORDER.authorName} (frakt ingår)`;
