"use client";

import { useCallback, useState } from "react";
import MonthlyReport from "@/features/author-workspaces/analytics/MonthlyReport";
import { buildMonthlyReport } from "@/lib/payments/monthly-report";

export default function MonthlyReportPreview() {
  const [mode, setMode] = useState("populated");
  const loadReport = useCallback(async (month: string) => {
    await new Promise((resolve) => setTimeout(resolve, mode === "slow" ? 2500 : 150));
    if (mode === "error") throw new Error("Synthetic report load failure");
    return buildMonthlyReport(month, mode === "empty" || month === "2026-08" ? [] : [
      { amount: 12345, currency: "sek", status: "paid" },
      { amount: 4500, currency: "eur", status: "paid" },
      { amount: 2500, currency: "sek", status: "refunded" },
      { amount: 1500, currency: "sek", status: "pending" },
      { amount: 1500, currency: "sek", status: "failed" },
    ]);
  }, [mode]);
  return <main className="mx-auto max-w-4xl space-y-6 p-6">
    <h1 className="text-2xl font-medium">Monthly report · local fixture</h1>
    <p>Synthetic data only. No Stripe, database, payment or payout requests. August 2026 is empty.</p>
    <label className="block">Fixture state <select aria-label="Fixture state" value={mode} onChange={(event) => setMode(event.target.value)} className="rounded border border-border bg-background p-2">
      <option value="populated">Orders in two currencies</option><option value="empty">Empty</option><option value="error">Load error</option><option value="slow">Slow response</option>
    </select></label>
    <MonthlyReport key={mode} initialMonth="2026-09" loadReport={loadReport} />
  </main>;
}
