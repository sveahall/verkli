import { afterEach, describe, expect, it, vi } from "vitest";
import { stripeAmountFractionDigits, stripeMinorToMajor } from "./stripe-currency";

describe("Stripe API currency units", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["HUF", "TWD"])("keeps %s API amounts in hundredths when ICU uses zero display decimals", (currency) => {
    const resolvedOptions = Intl.NumberFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.NumberFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.NumberFormat) {
      const options = resolvedOptions.call(this);
      return options.currency === currency
        ? { ...options, minimumFractionDigits: 0, maximumFractionDigits: 0 }
        : options;
    });
    expect(stripeAmountFractionDigits(currency)).toBe(2);
    expect(stripeMinorToMajor(12345, currency)).toBe(123.45);
  });

  it.each([
    ["SEK", 12345, 123.45], ["JPY", 123, 123], ["ISK", 12300, 123],
    ["UGX", 12300, 123], ["BHD", 12345, 12.345], ["KWD", 1005, 1.005],
  ])("preserves %s API precision", (currency, minor, major) => {
    expect(stripeMinorToMajor(minor, currency)).toBe(major);
  });
});
