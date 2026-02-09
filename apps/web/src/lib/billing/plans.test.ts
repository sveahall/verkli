import { describe, expect, it } from "vitest";
import { getBillingPriceConfig, getPriceIdForPlan } from "@/lib/billing/plans";

describe("billing price mapping", () => {
  const config = getBillingPriceConfig({
    PRICE_PLUS: "price_plus_123",
    PRICE_PRO: "price_pro_456",
  } as NodeJS.ProcessEnv);

  it("maps plus to PRICE_PLUS", () => {
    expect(getPriceIdForPlan("plus", config)).toBe("price_plus_123");
  });

  it("maps pro to PRICE_PRO", () => {
    expect(getPriceIdForPlan("pro", config)).toBe("price_pro_456");
  });
});
