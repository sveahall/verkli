import "server-only";
import Stripe from "stripe";
import { STRIPE_API_VERSION } from "./stripe";
import { monthBounds } from "./monthly-report";

export type ProviderTransaction = {
  id: string; created: number; availableOn: number; currency: string;
  amountMinor: string; feeMinor: string; netMinor: string;
  type: string; status: string; sourceLinked: boolean;
};
export type ProviderBalanceReport = {
  month: string; from: string; toExclusive: string; readStartedAt: string;
  accountId: string; mode: "test" | "live"; allPagesRead: boolean; pagesRead: number;
  missingSourceCount: number; transactions: ProviderTransaction[];
  currencies: { currency: string; amountMinor: string; feeMinor: string; netMinor: string }[];
};

function project(row: Stripe.BalanceTransaction, from: number, to: number): ProviderTransaction {
  if (!/^txn_[A-Za-z0-9_]+$/.test(row.id) || !/^[a-z]{3}$/.test(row.currency) ||
    ![row.amount, row.fee, row.net, row.created, row.available_on].every(Number.isSafeInteger) ||
    BigInt(row.amount) - BigInt(row.fee) !== BigInt(row.net) || row.created < from || row.created >= to ||
    !/^[a-z_]+$/.test(row.type) || !["available", "pending"].includes(row.status) ||
    (row.source !== null && typeof row.source !== "string")) {
    throw new Error("Invalid Stripe balance transaction data");
  }
  return { id: row.id, created: row.created, availableOn: row.available_on, currency: row.currency.toUpperCase(),
    amountMinor: String(row.amount), feeMinor: String(row.fee), netMinor: String(row.net),
    type: row.type, status: row.status, sourceLinked: Boolean(row.source) };
}

/** Platform account only. The API caller must verify an actual admin session first. */
export async function getStripeBalanceReport(month: string, now = new Date()): Promise<ProviderBalanceReport> {
  const bounds = monthBounds(month);
  const from = Date.parse(bounds.from) / 1000;
  const to = Math.min(Date.parse(bounds.to) / 1000, Math.floor(now.getTime() / 1000));
  if (!Number.isSafeInteger(to) || from > to) throw new RangeError("Choose a current or past month");
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const keyMode = key?.match(/^(?:sk|rk)_(test|live)_/)?.[1];
  if (!key || !keyMode) throw new Error("Stripe reporting is not configured");
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION, timeout: 5000, maxNetworkRetries: 0 });
  // No connected-account override or expansion: credentials determine one account and mode.
  const [account, balance] = await Promise.all([stripe.accounts.retrieve(), stripe.balance.retrieve()]);
  if (!/^acct_[A-Za-z0-9_]+$/.test(account.id) || typeof balance.livemode !== "boolean" ||
    (balance.livemode ? "live" : "test") !== keyMode) throw new Error("Stripe reporting scope could not be verified");
  const rows = new Map<string, ProviderTransaction>();
  const rawSignatures = new Map<string, string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let allPagesRead = false;
  let pagesRead = 0;
  for (; pagesRead < 5;) {
    const page = await stripe.balanceTransactions.list({ limit: 100, created: { gte: from, lt: to }, ...(cursor ? { starting_after: cursor } : {}) });
    pagesRead++;
    if (!Array.isArray(page.data) || page.data.length > 100 || typeof page.has_more !== "boolean") throw new Error("Invalid Stripe pagination data");
    for (const raw of page.data) {
      const row = project(raw, from, to);
      const signature = JSON.stringify([row, raw.source]);
      if (rows.has(row.id) && rawSignatures.get(row.id) !== signature) throw new Error("Conflicting Stripe transaction ID");
      rows.set(row.id, row);
      rawSignatures.set(row.id, signature);
    }
    if (!page.has_more) { allPagesRead = true; break; }
    cursor = page.data.at(-1)?.id;
    if (!cursor || cursors.has(cursor)) throw new Error("Stripe pagination did not advance");
    cursors.add(cursor);
  }
  const transactions = [...rows.values()];
  const sums = new Map<string, { amount: bigint; fee: bigint; net: bigint }>();
  for (const row of transactions) {
    const sum = sums.get(row.currency) ?? { amount: 0n, fee: 0n, net: 0n };
    sum.amount += BigInt(row.amountMinor); sum.fee += BigInt(row.feeMinor); sum.net += BigInt(row.netMinor);
    sums.set(row.currency, sum);
  }
  return { month, from: bounds.from, toExclusive: new Date(to * 1000).toISOString(), readStartedAt: now.toISOString(),
    accountId: account.id, mode: balance.livemode ? "live" : "test", allPagesRead, pagesRead,
    missingSourceCount: transactions.filter(row => !row.sourceLinked).length, transactions,
    currencies: [...sums].sort(([a], [b]) => a.localeCompare(b)).map(([currency, sum]) => ({ currency, amountMinor: String(sum.amount), feeMinor: String(sum.fee), netMinor: String(sum.net) })) };
}
