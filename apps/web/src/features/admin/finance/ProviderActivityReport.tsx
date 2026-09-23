"use client";

import { useEffect, useState } from "react";
import type { ProviderBalanceReport } from "@/lib/payments/stripe-balance-report";
import { stripeAmountFractionDigits } from "@/lib/payments/stripe-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type LoadReport = (month: string, signal: AbortSignal) => Promise<ProviderBalanceReport>;
async function fetchReport(month: string, signal: AbortSignal): Promise<ProviderBalanceReport> {
  const response = await fetch(`/api/admin/finance?month=${encodeURIComponent(month)}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Stripe account activity could not be loaded. No totals are available. Please retry.");
  return response.json();
}

function amount(value: string, currency: string): string {
  const minor = BigInt(value);
  const digits = stripeAmountFractionDigits(currency);
  const scale = 10n ** BigInt(digits);
  const whole = minor / scale;
  const fraction = (minor < 0n ? -minor : minor) % scale;
  return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: digits, maximumFractionDigits: digits })
    .formatToParts(whole === 0n && minor < 0n ? -0 : whole)
    .map(part => part.type === "fraction" ? String(fraction).padStart(digits, "0") : part.value).join("");
}

export function ProviderActivitySummary({ report }: { report: ProviderBalanceReport }) {
  return <div className="min-w-0 space-y-5">
    <Card className="space-y-2 p-5 text-sm">
      <p className="font-medium">{report.mode === "test" ? "Test mode" : "Live mode"} · Platform Stripe account</p>
      <p className="break-all text-muted-foreground">{report.accountId}</p>
      <p>{report.allPagesRead ? "All pages read for this period" : "Incomplete · More Stripe entries remain"} · {report.transactions.length} entries loaded</p>
      <p className="text-muted-foreground">Created from {report.from} up to, excluding, {report.toExclusive} (UTC).</p>
    </Card>
    {!report.allPagesRead ? <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">Incomplete: the read reached its five-page limit (up to 500 entries). Loaded totals cover only the entries below. Use Stripe reporting for the full period.</p> : null}
    <div className="rounded-xl border border-border p-5 text-sm">
      <h2 className="text-section-title">Coverage and missing data</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
        <li>These are payment-account movements, not author sales. Transfers, payouts, refunds and reversals can be included.</li>
        <li>Opening and closing balances: Not available. This report is not a balance reconciliation or a tax statement.</li>
        <li>Author attribution: Not available · Royalty: Not configured.</li>
        <li>Source linkage missing for {report.missingSourceCount} entries. A source link does not establish ownership or a payable amount.</li>
        <li>This is a live paginated read, not a frozen accounting snapshot. Only entries created before read start are requested.</li>
      </ul>
    </div>
    {report.currencies.length ? <div className="grid gap-4 md:grid-cols-2">
      {report.currencies.map(row => <Card key={row.currency} className="min-w-0 p-5">
        <h2 className="font-medium">{row.currency} · Loaded activity totals</h2>
        <dl className="mt-3 space-y-3 break-words text-sm tabular-nums">
          <div><dt className="text-muted-foreground">Signed amount</dt><dd>{amount(row.amountMinor, row.currency)}</dd></div>
          <div><dt className="text-muted-foreground">Signed fees</dt><dd>{amount(row.feeMinor, row.currency)}</dd></div>
          <div><dt className="text-muted-foreground">Net movement</dt><dd className="font-medium">{amount(row.netMinor, row.currency)}</dd></div>
        </dl>
      </Card>)}
    </div> : <Card className="p-5 text-sm">{report.allPagesRead ? "No balance entries were returned for this period and payment mode." : "No entries loaded. The read is incomplete."}</Card>}
    {report.transactions.length ? <details className="min-w-0 rounded-xl border border-border p-4">
      <summary className="cursor-pointer py-2 font-medium">Loaded balance entries ({report.transactions.length})</summary>
      <div className="mt-3 overflow-x-auto" role="region" aria-label="Stripe balance entries" tabIndex={0}>
        <table className="w-full text-left text-sm tabular-nums">
          <thead><tr>{["Entry", "Created (UTC)", "Type", "Status", "Amount", "Fee", "Net"].map(label => <th key={label} scope="col" className="whitespace-nowrap border-b border-border px-3 py-2 font-medium">{label}</th>)}</tr></thead>
          <tbody>{report.transactions.map(row => <tr key={row.id}>
            <td className="whitespace-nowrap border-b border-border px-3 py-3">{row.id}</td>
            <td className="whitespace-nowrap border-b border-border px-3 py-3">{new Date(row.created * 1000).toISOString()}</td>
            <td className="border-b border-border px-3 py-3">{row.type}</td><td className="border-b border-border px-3 py-3">{row.status}</td>
            {[row.amountMinor, row.feeMinor, row.netMinor].map((value, index) => <td key={index} className="whitespace-nowrap border-b border-border px-3 py-3">{amount(value, row.currency)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </details> : null}
    <p className="break-words text-xs text-muted-foreground">Read started {report.readStartedAt} · {report.pagesRead} pages read.</p>
  </div>;
}

export default function ProviderActivityReport({ initialMonth, loadReport = fetchReport }: { initialMonth: string; loadReport?: LoadReport }) {
  const [month, setMonth] = useState(initialMonth);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; report?: ProviderBalanceReport; error?: string } | null>(null);
  const key = `${month}:${attempt}`;
  const valid = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month);
  const current = result?.key === key ? result : null;
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    loadReport(month, controller.signal).then(report => {
      if (!controller.signal.aborted) setResult({ key, report });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, error: "Stripe account activity could not be loaded. No totals are available. Please retry." });
    });
    return () => controller.abort();
  }, [month, key, valid, loadReport]);
  return <section className="min-w-0 space-y-5" aria-label="Stripe account activity">
    <div className="flex flex-wrap items-end gap-3">
      <Input id="provider-month" type="month" label="Entry creation month (UTC)" value={month} onChange={event => setMonth(event.target.value)} />
      <Button type="button" variant="secondary" disabled={!valid} onClick={() => setAttempt(value => value + 1)}>Refresh activity</Button>
    </div>
    <div aria-live="polite">
      {!valid ? <p role="alert">Choose a valid month.</p> : current?.error ? <p role="alert">{current.error}</p> : current?.report ? <ProviderActivitySummary report={current.report} /> : <p role="status">Loading Stripe account activity…</p>}
    </div>
  </section>;
}
