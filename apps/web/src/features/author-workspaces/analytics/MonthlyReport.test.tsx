import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildMonthlyReport } from "@/lib/payments/monthly-report";
import { MonthlyReportSummary } from "./MonthlyReport";

describe("monthly financial report presentation", () => {
  it.each([
    ["SEK", "90,071,992,547,409.91"], ["JPY", "9,007,199,254,740,991"],
    ["BHD", "9,007,199,254,740.991"], ["ISK", "90,071,992,547,409.91"],
    ["UGX", "90,071,992,547,409.91"], ["HUF", "90,071,992,547,409.91"], ["TWD", "90,071,992,547,409.91"],
  ])("preserves exact minor units for %s at the accepted integer limit", (currency, formatted) => {
    const report = buildMonthlyReport("2026-09", [{ amount: Number.MAX_SAFE_INTEGER, currency, status: "paid" }]);
    const html = renderToStaticMarkup(<MonthlyReportSummary report={report} locale="en" />);
    expect(html).toContain(`${currency}\u00a0${formatted}`);
  });
  it("preserves Swedish separators and the final cent", () => {
    const report = buildMonthlyReport("2026-09", [{ amount: Number.MAX_SAFE_INTEGER, currency: "sek", status: "paid" }]);
    expect(renderToStaticMarkup(<MonthlyReportSummary report={report} locale="sv-SE" />)).toContain("90\u00a0071\u00a0992\u00a0547\u00a0409,91\u00a0SEK");
  });
  it("localizes fraction digits as well as integer digits", () => {
    const report = buildMonthlyReport("2026-09", [{ amount: 12345, currency: "usd", status: "paid" }]);
    expect(renderToStaticMarkup(<MonthlyReportSummary report={report} locale="ar-EG" />)).toContain("١٢٣٫٤٥");
  });
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
