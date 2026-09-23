import { describe, expect, it } from "vitest";
import { compareBalances, type BalanceEntry, type BalanceInput } from "./balance-reconciliation";

const scope = { accountId: "acct_fixture", livemode: false, balanceType: "payments" };
function entry(overrides: Partial<BalanceEntry> = {}): BalanceEntry {
  return { ...scope, id: "txn_sale", sourceId: "ch_sale", currency: "sek", created: 100,
    amountMinor: 10000, feeMinor: 300, netMinor: 9700, ...overrides };
}
function input(overrides: Partial<BalanceInput> = {}): BalanceInput {
  return { ...scope, from: 100, to: 200, coverageComplete: true, entries: [entry()],
    balances: [{ currency: "sek", openingMinor: 500, closingMinor: 10200 }], ...overrides };
}

describe("balance comparison", () => {
  it("compares opening plus signed net with closing and preserves balance currency", () => {
    const report = compareBalances(input());
    expect(report.status).toBe("matched");
    expect(report.rows[0]).toMatchObject({ currency: "SEK", amountMinor: 10000, feeMinor: 300, netMinor: 9700, differenceMinor: 0, entryCount: 1 });
  });
  it("counts repeated delivery once and preserves distinct entries on the same source", () => {
    const refund = entry({ id: "txn_refund", sourceId: "re_1", amountMinor: -2000, feeMinor: 0, netMinor: -2000 });
    const reversal = entry({ id: "txn_reversal", sourceId: "re_1", amountMinor: 2000, feeMinor: 0, netMinor: 2000 });
    const report = compareBalances(input({ entries: [entry(), refund, entry(), reversal, refund] }));
    expect(report.status).toBe("matched");
    expect(report.duplicateCount).toBe(2);
    expect(report.rows[0]).toMatchObject({ netMinor: 9700, feeMinor: 300, entryCount: 3 });
  });
  it("rejects conflicting duplicate balance IDs", () => {
    expect(() => compareBalances(input({ entries: [entry(), entry({ sourceId: "ch_other" })] }))).toThrow("Conflicting balance entry");
  });
  it("counts two partial refunds exactly once without reusing cumulative refund totals", () => {
    const first = entry({ id: "refund1", sourceId: "re_1", amountMinor: -2000, feeMinor: 0, netMinor: -2000 });
    const second = entry({ id: "refund2", sourceId: "re_2", amountMinor: -8000, feeMinor: 0, netMinor: -8000 });
    const report = compareBalances(input({ entries: [entry(), first, first, second], balances: [{ currency: "sek", openingMinor: 0, closingMinor: -300 }] }));
    expect(report.status).toBe("matched");
    expect(report.rows[0]).toMatchObject({ amountMinor: 0, feeMinor: 300, netMinor: -300, entryCount: 3 });
  });
  it.each([{ accountId: "acct_other" }, { livemode: true }, { balanceType: "risk_reserved" }])("rejects foreign scope %j", (other) => {
    expect(() => compareBalances(input({ entries: [entry(other)] }))).toThrow("scope");
  });
  it("keeps currencies separate and never applies an exchange rate", () => {
    const report = compareBalances(input({ entries: [entry(), entry({ id: "txn_eur", currency: "eur", amountMinor: 1000, feeMinor: 50, netMinor: 950 })],
      balances: [{ currency: "sek", openingMinor: 500, closingMinor: 10200 }, { currency: "eur", openingMinor: 0, closingMinor: 950 }] }));
    expect(report.rows.map((row) => [row.currency, row.netMinor])).toEqual([["EUR", 950], ["SEK", 9700]]);
    expect(report.status).toBe("matched");
  });
  it("uses creation boundaries and ignores movements before/at the end", () => {
    const report = compareBalances(input({ entries: [entry(), entry({ id: "old", created: 99 }), entry({ id: "next", created: 200 })] }));
    expect(report.rows[0].entryCount).toBe(1);
    expect(report.excludedCount).toBe(2);
  });
  it("counts a later-period refund without pulling the old sale into its period", () => {
    const report = compareBalances(input({ entries: [entry({ created: 99 }), entry({ id: "refund", sourceId: "re_1", amountMinor: -2000, feeMinor: 0, netMinor: -2000 })],
      balances: [{ currency: "sek", openingMinor: 9700, closingMinor: 7700 }] }));
    expect(report.status).toBe("matched");
    expect(report.rows[0]).toMatchObject({ amountMinor: -2000, netMinor: -2000, entryCount: 1 });
  });
  it("retains every movement beyond a thousand rows", () => {
    const entries = Array.from({ length: 1001 }, (_, index) => entry({ id: `txn_${index}`, amountMinor: 100, feeMinor: 1, netMinor: 99 }));
    const report = compareBalances(input({ entries, balances: [{ currency: "sek", openingMinor: 0, closingMinor: 99099 }] }));
    expect(report.status).toBe("matched");
    expect(report.rows[0]).toMatchObject({ entryCount: 1001, feeMinor: 1001, netMinor: 99099 });
  });
  it("does not claim a match from incomplete pages even when arithmetic matches", () => {
    const report = compareBalances(input({ coverageComplete: false }));
    expect(report.status).toBe("incomplete");
    expect(report.issues).toContain("incomplete_pages");
    expect(report.rows[0].differenceMinor).toBe(0);
  });
  it("keeps unknown sources and missing balances incomplete", () => {
    const report = compareBalances(input({ entries: [entry({ sourceId: null })], balances: [] }));
    expect(report.status).toBe("incomplete");
    expect(report.issues).toEqual(expect.arrayContaining(["unresolved_sources", "missing_balances"]));
    expect(report.rows[0]).toMatchObject({ openingMinor: null, closingMinor: null, differenceMinor: null });
  });
  it("shows a nonzero discrepancy without hiding it behind missing pages", () => {
    const report = compareBalances(input({ coverageComplete: false, balances: [{ currency: "sek", openingMinor: 0, closingMinor: 9701 }] }));
    expect(report.status).toBe("incomplete");
    expect(report.issues).toContain("balance_mismatch");
    expect(report.rows[0].differenceMinor).toBe(1);
    expect(compareBalances(input({ balances: [{ currency: "sek", openingMinor: 0, closingMinor: 9701 }] })).status).toBe("mismatch");
  });
  it("does not invent zero checkpoints for an empty dataset", () => {
    const report = compareBalances(input({ entries: [], balances: [] }));
    expect(report.status).toBe("incomplete");
    expect(report.rows).toEqual([]);
    expect(report.issues).toContain("missing_balances");
  });
  it("retains a real zero movement with known unchanged balance", () => {
    const report = compareBalances(input({ entries: [], balances: [{ currency: "jpy", openingMinor: 123, closingMinor: 123 }] }));
    expect(report.status).toBe("matched");
    expect(report.rows[0]).toMatchObject({ currency: "JPY", netMinor: 0, differenceMinor: 0 });
  });
  it("preserves negative balances and fee credits", () => {
    const report = compareBalances(input({ entries: [entry({ amountMinor: -10000, feeMinor: -300, netMinor: -9700 })],
      balances: [{ currency: "sek", openingMinor: 0, closingMinor: -9700 }] }));
    expect(report.status).toBe("matched");
    expect(report.rows[0].feeMinor).toBe(-300);
  });
  it.each([{ amountMinor: 0.5 }, { netMinor: 1 }, { feeMinor: NaN }, { currency: "??" }, { created: -1 }, { id: "" }])("rejects invalid entries %j", (bad) => {
    expect(() => compareBalances(input({ entries: [entry(bad)] }))).toThrow();
  });
  it("rejects duplicate currency checkpoints instead of picking one", () => {
    expect(() => compareBalances(input({ balances: [...input().balances, { currency: "SEK", openingMinor: 0, closingMinor: 0 }] }))).toThrow("Duplicate balance");
  });
  it("uses exact intermediate addition and rejects unsafe final amounts", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const big = entry({ amountMinor: max, feeMinor: 0, netMinor: max });
    const negative = entry({ id: "neg", amountMinor: -max, feeMinor: 0, netMinor: -max });
    const one = entry({ id: "one", amountMinor: 1, feeMinor: 0, netMinor: 1 });
    expect(compareBalances(input({ entries: [big, one, negative], balances: [{ currency: "sek", openingMinor: 0, closingMinor: 1 }] })).rows[0].netMinor).toBe(1);
    expect(() => compareBalances(input({ entries: [big, one] }))).toThrow("precision");
  });
  it.each([{ from: 200 }, { to: 99 }, { from: NaN }, { livemode: undefined }, { coverageComplete: undefined }])("requires explicit valid scope and coverage %j", (bad) => {
    expect(() => compareBalances(input(bad as Partial<BalanceInput>))).toThrow();
  });
});
