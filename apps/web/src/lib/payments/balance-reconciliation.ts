type BalanceScope = { accountId: string; livemode: boolean; balanceType: string };
export type BalanceEntry = BalanceScope & {
  id: string;
  sourceId: string | null;
  currency: string;
  created: number;
  amountMinor: number;
  feeMinor: number;
  netMinor: number;
};
export type BalanceInput = BalanceScope & {
  from: number;
  to: number;
  coverageComplete: boolean;
  entries: BalanceEntry[];
  // Total pending + available at the exact from/to boundaries, in balance currency.
  balances: { currency: string; openingMinor: number; closingMinor: number }[];
};
type BalanceIssue = "incomplete_pages" | "unresolved_sources" | "missing_balances" | "balance_mismatch";
export type BalanceRow = {
  currency: string;
  openingMinor: number | null;
  closingMinor: number | null;
  amountMinor: number;
  feeMinor: number;
  netMinor: number;
  differenceMinor: number | null;
  entryCount: number;
};
export type BalanceComparisonReport = BalanceScope & {
  from: number;
  to: number;
  status: "matched" | "incomplete" | "mismatch";
  issues: BalanceIssue[];
  rows: BalanceRow[];
  entries: BalanceEntry[];
  duplicateCount: number;
  excludedCount: number;
};

function currencyCode(value: string): string {
  if (typeof value !== "string" || !/^[a-z]{3}$/i.test(value)) throw new Error("Invalid balance currency.");
  return value.toUpperCase();
}
function integer(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("Invalid balance integer or precision.");
  return BigInt(value);
}
function safeNumber(value: bigint) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("Balance amount exceeds safe precision.");
  return number;
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Arithmetic on supplied data only. No provider verification, ownership attribution or payable royalty. */
export function compareBalances(input: BalanceInput): BalanceComparisonReport {
  if (!nonempty(input.accountId) || !nonempty(input.balanceType) || typeof input.livemode !== "boolean" ||
    typeof input.coverageComplete !== "boolean" || !Number.isSafeInteger(input.from) || input.from < 0 ||
    !Number.isSafeInteger(input.to) || input.to <= input.from || input.to > 8640000000000) {
    throw new Error("Invalid balance scope, period or coverage.");
  }
  const issues = new Set<BalanceIssue>();
  if (!input.coverageComplete) issues.add("incomplete_pages");
  const seen = new Map<string, string>();
  const entries: BalanceEntry[] = [];
  let duplicateCount = 0;
  let excludedCount = 0;
  for (const raw of input.entries) {
    if (raw.accountId !== input.accountId || raw.livemode !== input.livemode || raw.balanceType !== input.balanceType) {
      throw new Error("Balance entry belongs to a different account, mode or balance scope.");
    }
    if (!nonempty(raw.id) || (raw.sourceId !== null && !nonempty(raw.sourceId)) ||
      !Number.isSafeInteger(raw.created) || raw.created < 0) throw new Error("Invalid balance entry identity or date.");
    const currency = currencyCode(raw.currency);
    if (integer(raw.amountMinor) - integer(raw.feeMinor) !== integer(raw.netMinor)) throw new Error("Invalid balance entry: net must equal amount minus fee.");
    const fingerprint = JSON.stringify([raw.sourceId, currency, raw.created, raw.amountMinor, raw.feeMinor, raw.netMinor]);
    const previous = seen.get(raw.id);
    if (previous !== undefined) {
      if (previous !== fingerprint) throw new Error("Conflicting balance entry for the same ID.");
      duplicateCount++;
      continue;
    }
    seen.set(raw.id, fingerprint);
    if (raw.created < input.from || raw.created >= input.to) { excludedCount++; continue; }
    if (raw.sourceId === null) issues.add("unresolved_sources");
    entries.push({ ...raw, currency });
  }
  const totals = new Map<string, { amount: bigint; fee: bigint; net: bigint; count: number; opening: bigint | null; closing: bigint | null }>();
  function row(currency: string) {
    let value = totals.get(currency);
    if (!value) {
      value = { amount: 0n, fee: 0n, net: 0n, count: 0, opening: null, closing: null };
      totals.set(currency, value);
    }
    return value;
  }
  for (const balance of input.balances) {
    const value = row(currencyCode(balance.currency));
    if (value.opening !== null) throw new Error("Duplicate balance currency checkpoint.");
    value.opening = integer(balance.openingMinor);
    value.closing = integer(balance.closingMinor);
  }
  for (const entry of entries) {
    const value = row(entry.currency);
    value.amount += BigInt(entry.amountMinor);
    value.fee += BigInt(entry.feeMinor);
    value.net += BigInt(entry.netMinor);
    value.count++;
  }
  if (totals.size === 0) issues.add("missing_balances");
  const rows = [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]): BalanceRow => {
    const difference = value.opening !== null && value.closing !== null ? value.closing - value.opening - value.net : null;
    if (difference === null) issues.add("missing_balances");
    else if (difference !== 0n) issues.add("balance_mismatch");
    return { currency, openingMinor: value.opening === null ? null : safeNumber(value.opening),
      closingMinor: value.closing === null ? null : safeNumber(value.closing), amountMinor: safeNumber(value.amount),
      feeMinor: safeNumber(value.fee), netMinor: safeNumber(value.net), differenceMinor: difference === null ? null : safeNumber(difference), entryCount: value.count };
  });
  const incomplete = [...issues].some((issue) => issue !== "balance_mismatch");
  return { accountId: input.accountId, livemode: input.livemode, balanceType: input.balanceType, from: input.from, to: input.to,
    status: incomplete ? "incomplete" : issues.has("balance_mismatch") ? "mismatch" : "matched", issues: [...issues], rows,
    entries: entries.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id)), duplicateCount, excludedCount };
}
