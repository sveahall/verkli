"use client";

import { useCallback, useState } from "react";
import ProviderActivityReport from "@/features/admin/finance/ProviderActivityReport";
import type { ProviderBalanceReport, ProviderTransaction } from "@/lib/payments/stripe-balance-report";
import { monthBounds } from "@/lib/payments/monthly-report";

export default function ProviderReportPreview() {
  const [state, setState] = useState("populated");
  const loadReport = useCallback(async (month: string): Promise<ProviderBalanceReport> => {
    await new Promise(resolve => setTimeout(resolve, state === "slow" ? 1500 : 100));
    if (state === "error") throw new Error("Synthetic provider failure");
    const { from, to } = monthBounds(month);
    const empty = state === "empty" || month === "2026-08";
    const entries: ProviderTransaction[] = empty ? [] : [
      { id: "txn_demo_charge", created: Date.parse(from) / 1000 + 1, availableOn: Date.parse(from) / 1000 + 86400, currency: "SEK", amountMinor: "10000", feeMinor: "300", netMinor: "9700", type: "charge", status: "available", sourceLinked: true },
      { id: "txn_demo_refund", created: Date.parse(from) / 1000 + 2, availableOn: Date.parse(from) / 1000 + 86400, currency: "SEK", amountMinor: "-2000", feeMinor: "0", netMinor: "-2000", type: "refund", status: "available", sourceLinked: true },
      { id: "txn_demo_eur", created: Date.parse(from) / 1000 + 3, availableOn: Date.parse(from) / 1000 + 86400, currency: "EUR", amountMinor: "5000", feeMinor: "100", netMinor: "4900", type: "charge", status: "pending", sourceLinked: false },
    ];
    return { month, from, toExclusive: to, readStartedAt: to, accountId: "acct_synthetic_fixture", mode: "test", allPagesRead: state !== "incomplete", pagesRead: state === "incomplete" ? 5 : 1, missingSourceCount: empty ? 0 : 1, transactions: entries,
      currencies: empty ? [] : [{ currency: "SEK", amountMinor: "8000", feeMinor: "300", netMinor: "7700" }, { currency: "EUR", amountMinor: "5000", feeMinor: "100", netMinor: "4900" }] };
  }, [state]);
  return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-6 p-5">
    <h1 className="text-page-title">Stripe activity · local fixture</h1>
    <p className="text-sm text-muted-foreground">Synthetic data only. No provider or database requests. August 2026 is empty.</p>
    <label className="block text-sm">Fixture state <select aria-label="Fixture state" className="ml-2 min-h-11 rounded-xl border border-border bg-background px-3" value={state} onChange={event => setState(event.target.value)}>
      <option value="populated">Refund and two currencies</option><option value="empty">Empty</option><option value="incomplete">Missing pages</option><option value="error">Provider error</option><option value="slow">Slow response</option>
    </select></label>
    <ProviderActivityReport key={state} initialMonth="2026-09" loadReport={loadReport} />
  </main>;
}
