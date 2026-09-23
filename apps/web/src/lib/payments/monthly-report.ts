/** Order cohorts, not a cash ledger: orders has no settlement/refund/fee/tax dates or amounts. */
export type ReportOrder = { amount: number; currency: string | null; status: string };
export type RoyaltyInputs = { grossMinor: number | null; refundsMinor: number | null; feesMinor: number | null; taxMinor: number | null };
export type RoyaltyRule = { authorShareBps: number; deductions: ("refundsMinor" | "feesMinor" | "taxMinor")[] };

/** No default commercial terms. This helper does not authorize or initiate a payment. */
export function calculateRoyalty(inputs: RoyaltyInputs, rule: RoyaltyRule | null): { status: "not_configured" | "missing_data" | "calculated"; amountMinor: number | null } {
  if (!rule) return { status: "not_configured", amountMinor: null };
  if (!Number.isInteger(rule.authorShareBps) || rule.authorShareBps < 0 || rule.authorShareBps > 10000 ||
    new Set(rule.deductions).size !== rule.deductions.length ||
    rule.deductions.some((key) => !["refundsMinor", "feesMinor", "taxMinor"].includes(key))) {
    throw new Error("Invalid royalty rule: explicit share and unique deductions are required.");
  }
  const values = [inputs.grossMinor, ...rule.deductions.map((key) => inputs[key])];
  if (values.some((value) => value === null)) return { status: "missing_data", amountMinor: null };
  if (values.some((value) => !Number.isSafeInteger(value) || value! < 0)) throw new Error("Invalid royalty input amount.");
  const base = BigInt(inputs.grossMinor!) - rule.deductions.reduce((sum, key) => sum + BigInt(inputs[key]!), 0n);
  // Half away from zero, including a negative adjustment; no silent zero floor.
  const numerator = base * BigInt(rule.authorShareBps);
  const rounded = numerator < 0n ? -((-numerator + 5000n) / 10000n) : (numerator + 5000n) / 10000n;
  const amountMinor = Number(rounded);
  if (!Number.isSafeInteger(amountMinor)) throw new Error("Royalty amount exceeds safe precision.");
  return { status: "calculated", amountMinor };
}

export function monthBounds(month: string) {
  if (!/^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error("Choose a valid month (YYYY-MM).");
  const from = new Date(`${month}-01T00:00:00.000Z`);
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const REPORT_LIMITATIONS = [
  "This is a live read, not a transaction snapshot. Orders created at or after read start are excluded. Concurrent changes, deletions or backdated inserts can affect results; previously read rows are not rechecked.",
  "The order source does not record payment mode. Test payments cannot be separated from live payments in this report.",
  "Orders created in this UTC month, with their current status. Payment and refund dates are not recorded; prior reports can change.",
  "Paid order amounts are before partial refunds, fees, tax and royalty allocation. Revoked orders include both full refunds and disputes; their original amounts are not refund totals.",
  "Actual refunds, fees and tax are unavailable. No cash settlement or bank payout reconciliation has been performed.",
  "Royalty terms are not configured. No payable royalty or payout forecast is available.",
  "Only orders for currently owned books are included. Subscription pool allocations, print orders, standalone e-book sales and external distributors are not included.",
] as const;

export type MonthlyCurrency = {
  currency: string;
  paidCount: number;
  paidAmountMinor: number;
  revokedCount: number;
  revokedOrderAmountMinor: number;
  pendingCount: number;
  failedCount: number;
  refundsMinor: null;
  feesMinor: null;
  taxMinor: null;
  royaltyMinor: null;
};
export type MonthlyReport = {
  month: string;
  generatedAt: string;
  readStartedAt: string;
  dateBasis: "order_created_at_utc";
  reconciliation: "unreconciled";
  royaltyStatus: "not_configured";
  currencies: MonthlyCurrency[];
  limitations: readonly string[];
};

export function buildMonthlyReport(month: string, orders: ReportOrder[], readStartedAt = new Date().toISOString()): MonthlyReport {
  monthBounds(month);
  const currencies = new Map<string, MonthlyCurrency>();
  for (const order of orders) {
    const currency = order.currency?.trim().toUpperCase();
    if (!currency || !/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(order.amount) || order.amount < 0 ||
      !["paid", "refunded", "pending", "failed"].includes(order.status)) {
      throw new Error("Order data is incomplete or invalid; a reliable report cannot be generated.");
    }
    const row = currencies.get(currency) ?? {
      currency, paidCount: 0, paidAmountMinor: 0, revokedCount: 0, revokedOrderAmountMinor: 0,
      pendingCount: 0, failedCount: 0, refundsMinor: null, feesMinor: null, taxMinor: null, royaltyMinor: null,
    };
    if (order.status === "paid") { row.paidCount++; row.paidAmountMinor += order.amount; }
    if (order.status === "refunded") { row.revokedCount++; row.revokedOrderAmountMinor += order.amount; }
    if (order.status === "pending") row.pendingCount++;
    if (order.status === "failed") row.failedCount++;
    if (!Number.isSafeInteger(row.paidAmountMinor) || !Number.isSafeInteger(row.revokedOrderAmountMinor)) throw new Error("Report amount exceeds safe precision.");
    currencies.set(currency, row);
  }
  return {
    month, generatedAt: new Date().toISOString(), readStartedAt, dateBasis: "order_created_at_utc",
    reconciliation: "unreconciled", royaltyStatus: "not_configured",
    currencies: [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    limitations: REPORT_LIMITATIONS,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Export the loaded snapshot so a later refund cannot silently change an export's totals. */
export function monthlyReportCsv(report: MonthlyReport): string {
  const rows: (string | number)[][] = [
    ["month", report.month], ["generated_at_utc", report.generatedAt], ["read_started_at_utc", report.readStartedAt], ["date_basis", report.dateBasis],
    ["reconciliation", report.reconciliation], ["royalty_status", report.royaltyStatus],
    ...report.limitations.map((text) => ["limitation", text]), [],
    ["currency", "paid_order_count", "paid_order_amount_minor", "revoked_order_count", "revoked_original_amount_minor", "pending_count", "failed_count", "actual_refunds_minor", "fees_minor", "tax_minor", "royalty_minor"],
    ...report.currencies.map((row) => [row.currency, row.paidCount, row.paidAmountMinor, row.revokedCount, row.revokedOrderAmountMinor, row.pendingCount, row.failedCount, "unknown", "unknown", "unknown", "unknown"]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
