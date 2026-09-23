import type { BalanceEntry, BalanceInput } from "@/lib/payments/balance-reconciliation";

export const BALANCE_SCENARIOS = {
  matched: "Two currencies · arithmetic matches",
  refunds: "Two partial refunds · fees retained",
  reversal: "Failed refund · balance restored",
  "missing-page": "Missing transaction page",
  "unknown-source": "Unresolved source",
  "missing-balance": "Missing balance checkpoints",
  mismatch: "Closing balance mismatch",
  conflict: "Conflicting duplicate · invalid data",
  empty: "No financial data",
} as const;
export type BalanceScenario = keyof typeof BALANCE_SCENARIOS;
export function balanceScenario(scenario: BalanceScenario): BalanceInput {
  const scope = { accountId: "acct_local_fixture", livemode: false, balanceType: "payments" };
  const from = Date.parse("2026-09-01T00:00:00Z") / 1000;
  const sale: BalanceEntry = { ...scope, id: "txn_sale", sourceId: "ch_sale", currency: "sek", created: from + 86400, amountMinor: 10000, feeMinor: 300, netMinor: 9700 };
  const refund: BalanceEntry = { ...sale, id: "txn_refund_1", sourceId: "re_1", created: from + 172800, amountMinor: -2000, feeMinor: 0, netMinor: -2000 };
  const input: BalanceInput = { ...scope, from, to: Date.parse("2026-10-01T00:00:00Z") / 1000, coverageComplete: true,
    entries: [sale, { ...sale, id: "txn_eur", sourceId: "ch_eur", currency: "eur", amountMinor: 4500, feeMinor: 150, netMinor: 4350 }],
    balances: [{ currency: "sek", openingMinor: 500, closingMinor: 10200 }, { currency: "eur", openingMinor: 0, closingMinor: 4350 }] };
  if (scenario === "refunds" || scenario === "reversal") {
    input.entries = [sale, refund, { ...refund }];
    input.entries.push(scenario === "refunds"
      ? { ...refund, id: "txn_refund_2", sourceId: "re_2", created: from + 259200, amountMinor: -8000, netMinor: -8000 }
      : { ...refund, id: "txn_refund_failure", created: from + 259200, amountMinor: 2000, netMinor: 2000 });
    input.balances = [{ currency: "sek", openingMinor: 0, closingMinor: scenario === "refunds" ? -300 : 9700 }];
  }
  if (scenario === "missing-page") input.coverageComplete = false;
  if (scenario === "unknown-source") input.entries[0].sourceId = null;
  if (scenario === "missing-balance") input.balances = [];
  if (scenario === "mismatch") input.balances[0].closingMinor += 100;
  if (scenario === "conflict") input.entries.push({ ...sale, netMinor: 9600, feeMinor: 400 });
  if (scenario === "empty") { input.entries = []; input.balances = []; }
  return input;
}
