/** Stripe API amount precision, not FX conversion or payout eligibility.
 * https://docs.stripe.com/currencies#special-cases
 */
export function stripeAmountFractionDigits(currency: string): number {
  const code = currency.trim().toUpperCase();
  // Stripe keeps two-decimal API amounts for these zero-decimal ISO currencies.
  if (code === "ISK" || code === "UGX") return 2;
  return new Intl.NumberFormat("en", { style: "currency", currency: code })
    .resolvedOptions().maximumFractionDigits ?? 2;
}

export function stripeMinorToMajor(amountMinor: number, currency: string): number {
  return amountMinor / 10 ** stripeAmountFractionDigits(currency);
}
