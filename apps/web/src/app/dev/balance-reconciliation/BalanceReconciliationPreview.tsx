"use client";

import { useState } from "react";
import { compareBalances } from "@/lib/payments/balance-reconciliation";
import { BalanceComparison } from "@/features/author-workspaces/analytics/BalanceComparison";
import { BALANCE_SCENARIOS, balanceScenario, type BalanceScenario } from "./scenarios";

export default function BalanceReconciliationPreview() {
  const [scenario, setScenario] = useState<BalanceScenario>("matched");
  let report;
  let error;
  try { report = compareBalances(balanceScenario(scenario)); }
  catch (cause) { error = cause instanceof Error ? cause.message : "Balance comparison failed."; }
  return <main className="mx-auto w-full min-w-0 max-w-4xl space-y-6 p-6">
    <header><p className="text-sm text-muted-foreground">Economy · local preview</p><h1 className="mt-1 text-2xl font-medium">Balance reconciliation</h1></header>
    <p className="rounded-lg border border-border bg-muted p-4 text-sm">Synthetic data only. No Stripe, database, payment or payout requests. This preview compares supplied balances; it does not establish real financial reconciliation.</p>
    <div><label htmlFor="balance-scenario" className="mb-2 block text-sm font-medium">Financial scenario</label>
      <select id="balance-scenario" className="min-h-11 w-full max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={scenario} onChange={(event) => setScenario(event.target.value as BalanceScenario)}>
        {Object.entries(BALANCE_SCENARIOS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></div>
    <div aria-live="polite">{error ? <p role="alert" className="rounded-lg border border-destructive/40 p-5">Comparison unavailable: {error} No totals have been returned.</p> : report ? <BalanceComparison report={report} /> : null}</div>
  </main>;
}
