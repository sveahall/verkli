import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildMonthlyReport } from "@/lib/payments/monthly-report";
import { MonthlyReportSummary } from "./MonthlyReport";

describe("monthly financial report presentation", () => {
  it("labels unknowns, original revoked amounts and unreconciled status", () => {
    const report = buildMonthlyReport("2026-09", [{ amount: 12345, currency: "sek", status: "paid" }, { amount: 999, currency: "eur", status: "refunded" }]);
    const html = renderToStaticMarkup(<MonthlyReportSummary report={report} locale="en" />);
    expect(html).toContain("123.45");
    expect(html).toContain("SEK");
    expect(html).toContain("EUR");
    expect(html).toContain("9.99");
    expect(html).toContain("Original revoked order amounts");
    expect(html).toContain("Not available");
    expect(html).toContain("Not configured");
    expect(html).toContain("Not reconciled");
    expect(html).toContain("partial refunds");
  });
  it("renders empty months without inventing a zero-currency balance", () => {
    const html = renderToStaticMarkup(<MonthlyReportSummary report={buildMonthlyReport("2026-09", [])} locale="en" />);
    expect(html).toContain("No orders created in this month");
    expect(html).not.toContain("SEK");
    expect(html).toContain("Not configured");
  });
});
