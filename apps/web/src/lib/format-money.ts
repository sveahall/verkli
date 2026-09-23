/**
 * Formats a minor-unit amount (e.g. cents) as a locale-aware currency string.
 *
 * @param amount - The amount in minor currency units (e.g. 1999 = 19.99 USD).
 * @param currency - ISO 4217 currency code (e.g. "SEK", "USD").
 * @param maximumFractionDigits - Decimal places to show. Default 2.
 *   Pass 0 for whole-unit display (e.g. print prices, subscription prices).
 */
export function formatMoney(
  amount: number,
  currency: string,
  maximumFractionDigits = 2
): string {
  const value = amount / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits,
    }).format(value);
  } catch {
    return `${value.toFixed(maximumFractionDigits)} ${currency.toUpperCase()}`;
  }
}
