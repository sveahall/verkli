import type { BalanceComparisonReport } from "@/lib/payments/balance-reconciliation";
import { stripeAmountFractionDigits, stripeMinorToMajor } from "@/lib/payments/stripe-currency";

const labels = {
  incomplete_pages: "Missing transaction pages: observed movements are only a subtotal.",
  unresolved_sources: "Unresolved transaction sources: attribution has not been established.",
  missing_balances: "Missing opening or closing balances: no complete comparison is possible.",
  balance_mismatch: "Closing balance does not match opening balance plus observed net movements.",
};
export function BalanceComparison({ report }: { report: BalanceComparisonReport }) {
  function amount(value: number | null, currency: string) {
    if (value === null) return "Not available";
    const digits = stripeAmountFractionDigits(currency);
    return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(stripeMinorToMajor(value, currency));
  }
  const status = report.status === "matched" ? "Arithmetic matches" : report.status === "incomplete" ? "Incomplete comparison" : "Balance mismatch";
  return <section className="space-y-5" aria-label="Balance comparison">
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-medium">{status}</h2>
      <p className="mt-2 break-words text-sm text-muted-foreground">{report.accountId} · {report.livemode ? "Live mode" : "Test mode"} · {report.balanceType} balance</p>
      <p className="mt-1 text-sm text-muted-foreground">{new Date(report.from * 1000).toISOString().slice(0, 10)} to {new Date(report.to * 1000).toISOString().slice(0, 10)} (end excluded), UTC creation date</p>
      {report.issues.length > 0 && <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{report.issues.map((issue) => <li key={issue}>{labels[issue]}</li>)}</ul>}
    </div>
    {report.rows.length === 0 ? <p className="rounded-lg border border-border p-5">No balance entries or checkpoints supplied. A missing balance is not zero.</p> : <div className="grid gap-4 sm:grid-cols-2">
      {report.rows.map((row) => <section key={row.currency} aria-label={`${row.currency} balance comparison`} className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-lg font-medium">{row.currency}</h3>
        <dl className="mt-4 space-y-3 text-sm">
          {([ ["Opening balance", row.openingMinor], ["Observed gross movement", row.amountMinor], ["Observed fees (credits are negative)", row.feeMinor], ["Observed net movement", row.netMinor], ["Closing balance", row.closingMinor], ["Difference: closing − opening − net", row.differenceMinor] ] as const).map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium tabular-nums">{amount(value, row.currency)}</dd></div>)}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">{row.entryCount} unique balance entries</p>
      </section>)}
    </div>}
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
      <h3 className="font-medium">Comparison limits</h3>
      <p className="mt-2">A matching calculation does not verify provider coverage, historical ownership or author attribution. No payable royalty, tax statement or bank settlement is established.</p>
      <p className="mt-2">Checkpoints combine pending and available funds in the same balance type. Availability buckets are not reconciled separately. Amounts use balance currency; no exchange rate or order-currency conversion is applied.</p>
    </div>
    <details className="rounded-xl border border-border p-5">
      <summary className="cursor-pointer font-medium">Observed entries · {report.duplicateCount} duplicates ignored · {report.excludedCount} outside period</summary>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm"><caption className="sr-only">Unique observed balance movements in minor currency units</caption>
          <thead><tr>{["Balance ID", "Source", "Currency", "Gross (minor)", "Fee (minor)", "Net (minor)"].map((label) => <th scope="col" key={label} className="whitespace-nowrap p-2 font-medium">{label}</th>)}</tr></thead>
          <tbody>{report.entries.map((entry) => <tr key={entry.id} className="border-t border-border">{[entry.id, entry.sourceId ?? "Unresolved", entry.currency, entry.amountMinor, entry.feeMinor, entry.netMinor].map((value, index) => <td key={index} className="whitespace-nowrap p-2 tabular-nums">{value}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
