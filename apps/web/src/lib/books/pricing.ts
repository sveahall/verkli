export const PRICE_CURRENCIES = ["SEK", "EUR", "USD"] as const;
export type PriceCurrency = (typeof PRICE_CURRENCIES)[number];

export const PRICING_MODELS = ["book_only", "per_chapter"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export type BookPricing = {
  priceAmount: number | null;
  priceCurrency: PriceCurrency;
  pricingModel: PricingModel;
  isFree: boolean;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value);
}

export function normalizePriceAmount(value: unknown): number | null {
  if (!isFiniteNumber(value)) return null;
  return Math.trunc(value);
}

export function normalizePriceCurrency(value: unknown): PriceCurrency | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "SEK" || normalized === "EUR" || normalized === "USD") {
    return normalized;
  }
  return null;
}

export function normalizePricingModel(value: unknown): PricingModel | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "book_only") {
    return "book_only";
  }
  if (normalized === "per_chapter") {
    return "per_chapter";
  }
  return null;
}

export function isFreePriceAmount(value: number | null | undefined): boolean {
  return value == null || value <= 0;
}

export function isPaidPriceAmount(value: number | null | undefined): value is number {
  return typeof value === "number" && value >= 1;
}

export function toBookPricing(input: {
  priceAmount: unknown;
  priceCurrency: unknown;
  pricingModel: unknown;
}): BookPricing | null {
  const amount = normalizePriceAmount(input.priceAmount);
  if (amount !== null && amount < 0) return null;

  const model = normalizePricingModel(input.pricingModel);
  if (!model) return null;

  const free = isFreePriceAmount(amount);
  const currency = normalizePriceCurrency(input.priceCurrency);
  if (!free && !currency) return null;

  return {
    priceAmount: amount,
    priceCurrency: currency ?? "USD",
    pricingModel: model,
    isFree: free,
  };
}
