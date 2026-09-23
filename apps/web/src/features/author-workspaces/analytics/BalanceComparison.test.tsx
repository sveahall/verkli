import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareBalances } from "@/lib/payments/balance-reconciliation";
import { balanceScenario } from "@/app/dev/balance-reconciliation/scenarios";
import { BalanceComparison } from "./BalanceComparison";

describe("balance comparison presentation", () => {
  it.each([
    ["SEK", "90,071,992,547,409.91"], ["JPY", "9,007,199,254,740,991"],
    ["BHD", "9,007,199,254,740.991"], ["ISK", "90,071,992,547,409.91"],
    ["UGX", "90,071,992,547,409.91"], ["HUF", "90,071,992,547,409.91"], ["TWD", "90,071,992,547,409.91"],
  ])("preserves the exact last minor unit for positive and negative %s limits", (currency, formatted) => {
    for (const sign of [1, -1]) {
      const fixture = balanceScenario("matched");
      const minor = sign * Number.MAX_SAFE_INTEGER;
      fixture.entries = [{ ...fixture.entries[0], currency, amountMinor: minor, feeMinor: 0, netMinor: minor }];
      fixture.balances = [{ currency, openingMinor: 0, closingMinor: minor }];
      const html = renderToStaticMarkup(<BalanceComparison report={compareBalances(fixture)} />);
      expect(html).toContain(`${sign < 0 ? "-" : ""}${currency}\u00a0${formatted}`);
    }
  });
  it("preserves the sign of negative movements smaller than one major unit", () => {
    const fixture = balanceScenario("matched");
    fixture.entries = [{ ...fixture.entries[0], amountMinor: -1, feeMinor: 0, netMinor: -1 }];
    fixture.balances = [{ currency: "sek", openingMinor: 0, closingMinor: -1 }];
    expect(renderToStaticMarkup(<BalanceComparison report={compareBalances(fixture)} />)).toContain("-SEK\u00a00.01");
  });
  it("identifies an arithmetic comparison without calling it payable or reconciled", () => {
    const html = renderToStaticMarkup(<BalanceComparison report={compareBalances(balanceScenario("matched"))} />);
    expect(html).toContain("Arithmetic matches");
    expect(html).toContain("SEK");
    expect(html).toContain("EUR");
    expect(html).toContain("No payable royalty");
    expect(html).toContain("author attribution");
    expect(html).not.toContain("Reconciled");
  });
  it("shows incomplete coverage even when arithmetic matches", () => {
    const html = renderToStaticMarkup(<BalanceComparison report={compareBalances(balanceScenario("missing-page"))} />);
    expect(html).toContain("Incomplete comparison");
    expect(html).toContain("Missing transaction pages");
    expect(html).toContain("Observed net movement");
    expect(html).not.toContain("Arithmetic matches");
  });
  it("shows unknown checkpoints separately from zero", () => {
    const html = renderToStaticMarkup(<BalanceComparison report={compareBalances(balanceScenario("missing-balance"))} />);
    expect(html).toContain("Not available");
    expect(html).toContain("Missing opening or closing balances");
  });
  it("renders empty data without an invented currency", () => {
    const html = renderToStaticMarkup(<BalanceComparison report={compareBalances(balanceScenario("empty"))} />);
    expect(html).toContain("No balance entries or checkpoints supplied");
    expect(html).not.toContain("SEK");
  });
});
