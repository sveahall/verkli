"use client";

import { useEffect, useState } from "react";
import { monthlyReportCsv, type MonthlyReport as Report } from "@/lib/payments/monthly-report";
import { stripeAmountFractionDigits, stripeMinorToMajor } from "@/lib/payments/stripe-currency";

type LoadReport = (month: string, signal: AbortSignal) => Promise<Report>;
async function fetchReport(month: string, signal: AbortSignal): Promise<Report> {
  const response = await fetch(`/api/author/stats/monthly-report?month=${encodeURIComponent(month)}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("The monthly report could not be loaded. Please retry.");
  return response.json();
}

export function MonthlyReportSummary({ report, locale }: { report: Report; locale: string }) {
  function amount(value: number, currency: string) {
    const digits = stripeAmountFractionDigits(currency);
    return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(stripeMinorToMajor(value, currency));
  }
  return <div className="space-y-4">
    <p className="text-sm font-medium">{report.month} · Not reconciled · Royalty: Not configured</p>
    {report.currencies.length === 0 ? <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No orders created in this month for your currently owned books.</p> :
      <div className="grid gap-4 sm:grid-cols-2">
        {report.currencies.map((row) => <section key={row.currency} className="rounded-lg border border-border p-4" aria-label={`${row.currency} orders`}>
          <h3 className="font-medium">{row.currency}</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-muted-foreground">Paid order amounts ({row.paidCount} orders)</dt><dd className="text-lg font-medium">{amount(row.paidAmountMinor, row.currency)}</dd></div>
            <div><dt className="text-muted-foreground">Original revoked order amounts ({row.revokedCount} orders)</dt><dd>{amount(row.revokedOrderAmountMinor, row.currency)}</dd></div>
            <div><dt className="text-muted-foreground">Pending / failed orders</dt><dd>{row.pendingCount} / {row.failedCount}</dd></div>
            <div><dt className="text-muted-foreground">Actual refunds / fees / tax</dt><dd>Not available</dd></div>
            <div><dt className="text-muted-foreground">Payable royalty</dt><dd>Not configured</dd></div>
          </dl>
        </section>)}
      </div>}
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      <h3 className="font-medium">Report coverage and missing data</h3>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-muted-foreground">{report.limitations.map((text) => <li key={text}>{text}</li>)}</ul>
    </div>
    <p className="text-xs text-muted-foreground">Read started {report.readStartedAt} · Report generated {report.generatedAt} · Amounts exported in currency minor units.</p>
  </div>;
}

export default function MonthlyReport({ locale = "en", initialMonth, loadReport = fetchReport }: { locale?: string; initialMonth: string; loadReport?: LoadReport }) {
  const [month, setMonth] = useState(initialMonth);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; report?: Report; error?: string } | null>(null);
  const key = `${month}:${attempt}`;
  const validMonth = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month);
  const current = result?.key === key ? result : null;
  const report = current?.report;
  useEffect(() => {
    if (!validMonth) return;
    const controller = new AbortController();
    loadReport(month, controller.signal).then((report) => {
      if (!controller.signal.aborted) setResult({ key, report });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, error: "The monthly report could not be loaded. Please retry." });
    });
    return () => controller.abort();
  }, [month, key, validMonth, loadReport]);

  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob(["\uFEFF", monthlyReportCsv(report)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `verkli-monthly-orders-${report.month}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section aria-labelledby="monthly-report-title" className="rounded-xl border border-border bg-card p-6 shadow-sm">
    <h2 id="monthly-report-title" className="author-section-title text-lg font-medium">Monthly order report</h2>
    <p className="mt-2 text-sm text-muted-foreground">Review order amounts by currency and export this snapshot. This is an incomplete financial report, not a tax statement or payout balance.</p>
    <div className="my-5 flex flex-wrap items-end gap-3">
      <div><label htmlFor="report-month" className="mb-1 block text-sm font-medium">Order creation month (UTC)</label><input id="report-month" type="month" required value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
      <button type="button" onClick={() => setAttempt((value) => value + 1)} disabled={!validMonth} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">Refresh report</button>
      <button type="button" disabled={!report} onClick={download} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Export monthly CSV</button>
    </div>
    <div aria-live="polite">
      {!validMonth ? <p role="alert">Choose a valid month.</p> : current?.error ? <p role="alert">{current.error}</p> : !report ? <p role="status">Loading monthly report…</p> : <MonthlyReportSummary report={report} locale={locale} />}
    </div>
  </section>;
}
