import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareBalances } from "@/lib/payments/balance-reconciliation";
import { balanceScenario } from "@/app/dev/balance-reconciliation/scenarios";
import { BalanceComparison } from "./BalanceComparison";

describe("balance comparison presentation", () => {
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
