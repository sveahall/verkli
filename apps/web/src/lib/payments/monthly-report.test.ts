import { describe, expect, it } from "vitest";
import { buildMonthlyReport, monthlyReportCsv, monthBounds, calculateRoyalty } from "./monthly-report";

const order = (amount: number, currency = "sek", status = "paid") => ({ amount, currency, status });

describe("monthly order report", () => {
  it("separates currencies, statuses and unknown financial data", () => {
    const report = buildMonthlyReport("2026-09", [order(12000), order(3000, "SEK"), order(450, "eur"), order(900, "sek", "refunded"), order(600, "sek", "pending"), order(700, "sek", "failed")]);
    expect(report.currencies).toEqual([
      expect.objectContaining({ currency: "EUR", paidAmountMinor: 450, paidCount: 1 }),
      expect.objectContaining({ currency: "SEK", paidAmountMinor: 15000, paidCount: 2, revokedOrderAmountMinor: 900, revokedCount: 1, pendingCount: 1, failedCount: 1, refundsMinor: null, feesMinor: null, taxMinor: null, royaltyMinor: null }),
    ]);
    expect(report.royaltyStatus).toBe("not_configured");
    expect(report.reconciliation).toBe("unreconciled");
  });
  it("does not invent currency or turn malformed amounts into zero", () => {
    expect(() => buildMonthlyReport("2026-09", [order(1, "")])).toThrow();
    expect(() => buildMonthlyReport("2026-09", [order(1.5)])).toThrow();
    expect(() => buildMonthlyReport("2026-09", [order(-1)])).toThrow();
    expect(() => buildMonthlyReport("2026-09", [order(1, "sek", "unknown")])).toThrow();
    expect(() => buildMonthlyReport("2026-09", [order(Number.MAX_SAFE_INTEGER), order(1)])).toThrow();
  });
  it("has an explicit empty result", () => {
    expect(buildMonthlyReport("2026-09", []).currencies).toEqual([]);
  });
  it("uses UTC calendar bounds with exclusive next-month end", () => {
    expect(monthBounds("2026-12")).toEqual({ from: "2026-12-01T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z" });
    expect(() => monthBounds("2026-13")).toThrow();
    expect(() => monthBounds("26-09")).toThrow();
  });
  it("exports exactly the displayed snapshot and unknown fields, without a payout claim", () => {
    const csv = monthlyReportCsv(buildMonthlyReport("2026-09", [order(1234)]));
    expect(csv).toContain("order_created_at_utc");
    expect(csv).toContain("unreconciled");
    expect(csv).toContain("not_configured");
    expect(csv).toContain("SEK,1,1234,0,0,0,0,unknown,unknown,unknown,unknown");
    expect(csv).toContain("partial refunds");
  });
});

describe("explicit royalty calculation contract", () => {
  const data = { grossMinor: 10000, refundsMinor: 1000, feesMinor: 250, taxMinor: 1750 };
  it("never selects terms implicitly", () => {
    expect(calculateRoyalty(data, null)).toEqual({ status: "not_configured", amountMinor: null });
  });
  it("uses configured share and exact declared deductions, rounding once per currency", () => {
    expect(calculateRoyalty(data, { authorShareBps: 6125, deductions: ["refundsMinor", "feesMinor", "taxMinor"] })).toEqual({ status: "calculated", amountMinor: 4288 });
  });
  it("refuses missing inputs and invalid terms", () => {
    expect(calculateRoyalty({ ...data, feesMinor: null }, { authorShareBps: 6125, deductions: ["feesMinor"] })).toEqual({ status: "missing_data", amountMinor: null });
    expect(() => calculateRoyalty(data, { authorShareBps: 10001, deductions: [] })).toThrow();
  });
});
