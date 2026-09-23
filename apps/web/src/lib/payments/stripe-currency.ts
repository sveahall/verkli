/** Stripe API amount precision, not FX conversion or payout eligibility.
 * https://docs.stripe.com/currencies#special-cases
 */
export function stripeAmountFractionDigits(currency: string): number {
  const code = currency.trim().toUpperCase();
  // These API amounts remain in hundredths even when ICU uses zero display
  // decimals. HUF/TWD payouts must be divisible by 100, not scaled as whole units.
  if (["ISK", "UGX", "HUF", "TWD"].includes(code)) return 2;
  return new Intl.NumberFormat("en", { style: "currency", currency: code })
    .resolvedOptions().maximumFractionDigits ?? 2;
}

export function stripeMinorToMajor(amountMinor: number, currency: string): number {
  return amountMinor / 10 ** stripeAmountFractionDigits(currency);
}
