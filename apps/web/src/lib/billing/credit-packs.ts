/**
 * Server-owned credit pricing.
 *
 * Why this file exists: `credits/checkout` used to read BOTH `amountMinor` and
 * `creditsDelta` from the request body, validating only that each was > 0.
 * Nothing on the server tied them together, so a caller could pay 3 SEK and ask
 * for a hundred million credits — the webhook grants `credit_topups.credits_delta`
 * verbatim. A secure checkout has exactly ONE client-chosen degree of freedom:
 * which product. Price and quantity are looked up here, never supplied.
 *
 * This mirrors what `billing_plan_catalog` already does for subscriptions (see
 * `getPriceIdForRolePlan` in ./catalog.ts). Packs live in code rather than the
 * DB because they carry no Stripe price id — the amount is charged ad hoc via
 * `price_data`. Move them to a table if you ever need per-market pricing.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ TODO(pricing): the three rows below are PLACEHOLDERS, not agreed prices. │
 * │ No credit pricing existed anywhere in the repo when these were written   │
 * │ (no UI strings, no docs, no catalog rows). Confirm the amounts and the   │
 * │ credit counts before enabling credit purchase in production.             │
 * │ The only existing anchor is REFERRAL_CREDIT_BONUS = 100 in               │
 * │ api/referrals/redeem/route.ts.                                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export type CreditPackId = "small" | "medium" | "large";

export type CreditPack = {
  id: CreditPackId;
  /** Charged amount in the currency's minor unit (öre for SEK). */
  amountMinor: number;
  /** Credits granted by the webhook once the charge is paid. */
  credits: number;
  /** ISO 4217. Fixed per pack so the client cannot name a currency. */
  currency: string;
};

export const CREDIT_PACKS: Record<CreditPackId, CreditPack> = {
  small: { id: "small", amountMinor: 9900, credits: 500, currency: "SEK" },
  medium: { id: "medium", amountMinor: 29900, credits: 2000, currency: "SEK" },
  large: { id: "large", amountMinor: 99900, credits: 10000, currency: "SEK" },
};

/**
 * Whether the prices above have been agreed and may charge real customers.
 *
 * A TODO comment is documentation; this is the gate. While it is false,
 * `credits/checkout` answers 404 — placeholder prices cannot charge anyone by
 * accident just because the route exists. Flip it in the same commit that
 * replaces the figures above with real ones.
 */
export const CREDIT_PRICING_CONFIRMED = false;

/**
 * Resolve an untrusted `packId` from a request body.
 *
 * Returns null for anything not in the table — including non-strings, so the
 * caller does not need to pre-validate the type. Never throws.
 */
export function getCreditPack(packId: unknown): CreditPack | null {
  if (typeof packId !== "string") return null;
  return Object.prototype.hasOwnProperty.call(CREDIT_PACKS, packId)
    ? CREDIT_PACKS[packId as CreditPackId]
    : null;
}

/** The packs a client may choose from, for rendering a purchase UI. */
export function listCreditPacks(): CreditPack[] {
  return Object.values(CREDIT_PACKS);
}
