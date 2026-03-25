import { describe, expect, it } from "vitest";
import {
  extractInvoicePeriodEnd,
  extractPriceIdsFromCheckoutSession,
  parsePaymentKindFromMetadata,
  toPatch,
} from "./stripeWebhook.helpers";

describe("stripe webhook helpers", () => {
  it("parses payment kind aliases from metadata", () => {
    expect(
      parsePaymentKindFromMetadata({ payment_kind: "credit-topup" })
    ).toBe("credit_topup");
    expect(parsePaymentKindFromMetadata({ payment_type: "pod" })).toBe("pod");
    expect(parsePaymentKindFromMetadata({ payment_kind: "other" })).toBeNull();
  });

  it("extracts checkout session price ids from objects and strings", () => {
    expect(
      extractPriceIdsFromCheckoutSession({
        line_items: {
          data: [
            { price: { id: "price_a" } },
            { price: "price_b" },
            { price: { id: "" } },
          ],
        },
      })
    ).toEqual(["price_a", "price_b"]);
  });

  it("prefers line item periods when deriving invoice period end", () => {
    expect(
      extractInvoicePeriodEnd({
        period_end: 1_700_000_000,
        lines: {
          data: [{ period: { end: 1_800_000_000 } }],
        },
      })
    ).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it("builds billing patches without leaking undefined keys", () => {
    expect(
      toPatch({
        stripeCustomerId: "cus_123",
        status: "active",
      })
    ).toEqual({
      stripe_customer_id: "cus_123",
      status: "active",
    });
  });
});
