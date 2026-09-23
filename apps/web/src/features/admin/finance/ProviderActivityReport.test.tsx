import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProviderBalanceReport } from "@/lib/payments/stripe-balance-report";
import { ProviderActivitySummary } from "./ProviderActivityReport";
const report: ProviderBalanceReport = { month: "2026-09", from: "2026-09-01T00:00:00.000Z", toExclusive: "2026-10-01T00:00:00.000Z", readStartedAt: "2026-10-02T00:00:00.000Z", accountId: "acct_fixture", mode: "test", pagesRead: 1, allPagesRead: true, missingSourceCount: 0, currencies: [], transactions: [] };
describe("provider activity presentation", () => {
  it("labels test scope, empty data and unavailable attribution", () => {
    const html = renderToStaticMarkup(<ProviderActivitySummary report={report} />);
    expect(html).toContain("Test mode");
    expect(html).toContain("No balance entries");
    expect(html).toContain("Royalty: Not configured");
    expect(html).toContain("not author sales");
    expect(html).toContain("Opening and closing balances: Not available");
    expect(html).not.toContain("SEK");
  });
  it("does not claim an incomplete empty read has no entries", () => {
    const html = renderToStaticMarkup(<ProviderActivitySummary report={{ ...report, allPagesRead: false }} />);
    expect(html).toContain("Incomplete");
    expect(html).toContain("No entries loaded");
    expect(html).not.toContain("No balance entries");
  });
  it.each([["SEK", "90,071,992,547,410.21"], ["JPY", "9,007,199,254,741,021"], ["BHD", "9,007,199,254,741.021"]])("keeps aggregate precision above the safe-number limit in %s", (currency, formatted) => {
    const html = renderToStaticMarkup(<ProviderActivitySummary report={{ ...report, mode: "live", currencies: [{ currency, amountMinor: "9007199254741021", feeMinor: "-1", netMinor: "9007199254741022" }] }} />);
    expect(html).toContain(formatted);
    expect(html).toContain("Live mode");
  });
});
