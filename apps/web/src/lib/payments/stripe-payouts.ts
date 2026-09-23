import "server-only";
import Stripe from "stripe";
import { STRIPE_API_VERSION } from "./stripe";

export type PayoutSnapshot = {
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
  payouts: Pick<Stripe.Payout, "id" | "amount" | "currency" | "status" | "created" | "arrival_date">[];
  hasMore: boolean;
  livemode: boolean;
};

/** Call only with the connected account mapped to the verified author. */
export async function getConnectedPayoutSnapshot(stripeAccountId: string): Promise<PayoutSnapshot> {
  if (!/^acct_[A-Za-z0-9_]+$/.test(stripeAccountId)) {
    throw new Error("A valid connected account is required to read payouts");
  }
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY — cannot read author payouts");
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION, timeout: 15_000, maxNetworkRetries: 1 });
  const options = { stripeAccount: stripeAccountId };
  const [balance, payouts] = await Promise.all([
    stripe.balance.retrieve({}, options),
    stripe.payouts.list({ limit: 100 }, options),
  ]);
  return {
    available: balance.available.map(({ amount, currency }) => ({ amount, currency })),
    pending: balance.pending.map(({ amount, currency }) => ({ amount, currency })),
    payouts: payouts.data.map(({ id, amount, currency, status, created, arrival_date }) => ({
      id, amount, currency, status, created, arrival_date,
    })),
    hasMore: payouts.has_more,
    livemode: balance.livemode,
  };
}

export function formatPayoutAmount(amount: number, currency: string, locale: string): string {
  const code = currency.toUpperCase();
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay: "code" });
  // Stripe retains two-decimal API amounts for ISK and UGX despite their ISO precision.
  // https://docs.stripe.com/currencies#special-cases
  const digits = code === "ISK" || code === "UGX" ? 2 : (formatter.resolvedOptions().maximumFractionDigits ?? 2);
  return formatter.format(amount / 10 ** digits);
}

function csvCell(value: string | number | boolean): string {
  let text = String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Raw minor amounts preserve Stripe precision and never mix currencies. */
export function payoutReportCsv(snapshot: PayoutSnapshot): string {
  const rows: (string | number | boolean)[][] = [
    ["scope", "connected_stripe_account_payouts_only"],
    ["coverage", "latest_100"],
    ["has_more", snapshot.hasMore],
    ["livemode", snapshot.livemode],
    ["generated_at_utc", new Date().toISOString()],
    [],
    ["payout_id", "created_utc", "expected_arrival_utc", "amount_minor", "currency", "status"],
    ...snapshot.payouts.map((payout) => [
      payout.id,
      new Date(payout.created * 1000).toISOString(),
      new Date(payout.arrival_date * 1000).toISOString(),
      payout.amount,
      payout.currency.toUpperCase(),
      payout.status,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
