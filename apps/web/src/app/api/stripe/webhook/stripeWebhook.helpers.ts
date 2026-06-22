import { type BillingAccountPatch } from "@/lib/billing/server";
import { type BillingPlan } from "@/lib/billing/plans";

export type StripeRecord = Record<string, unknown>;

export type StripeWebhookEvent = {
  id?: string | null;
  type?: string | null;
  data?: {
    object?: unknown;
  } | null;
};

export type PaymentKind =
  | "donation"
  | "credit_topup"
  | "translation"
  | "audiobook"
  | "pod"
  | "author_subscription"
  | "book_order";

export type FinalizeCheckoutFunction =
  | "finalize_order_checkout_session"
  | "finalize_donation_checkout_session"
  | "finalize_credit_topup_checkout_session";

export function asRecord(value: unknown): StripeRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as StripeRecord;
}

export function trimToNull(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

export function extractStripeId(value: unknown): string | null {
  if (typeof value === "string") {
    return trimToNull(value);
  }

  const record = asRecord(value);
  return record ? trimToNull(record.id) : null;
}

export function extractMetadata(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};

  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "string") {
      out[key] = item;
    }
  }
  return out;
}

export function parsePaymentKind(value: unknown): PaymentKind | null {
  const normalized = trimToNull(value)?.toLowerCase();
  if (normalized === "donation") return "donation";
  if (normalized === "credit_topup" || normalized === "credit-topup") {
    return "credit_topup";
  }
  if (normalized === "translation") return "translation";
  if (normalized === "audiobook") return "audiobook";
  if (normalized === "pod") return "pod";
  if (normalized === "author_subscription" || normalized === "author-subscription") {
    return "author_subscription";
  }
  if (normalized === "book_order" || normalized === "book-order") {
    return "book_order";
  }
  return null;
}

export function parsePaymentKindFromMetadata(
  metadata: Record<string, string>
): PaymentKind | null {
  return parsePaymentKind(metadata.payment_kind ?? metadata.payment_type);
}

export function isPaidCheckoutSession(session: StripeRecord): boolean {
  return trimToNull(session.payment_status) === "paid";
}

export function extractPriceIdsFromSubscription(
  subscription: StripeRecord
): string[] {
  const items = asRecord(subscription.items);
  if (!items || !Array.isArray(items.data)) return [];

  const ids: string[] = [];
  for (const item of items.data) {
    const itemRecord = asRecord(item);
    const priceRecord = asRecord(itemRecord?.price);
    const priceId = trimToNull(priceRecord?.id);
    if (priceId) {
      ids.push(priceId);
    }
  }

  return ids;
}

export function extractPriceIdsFromInvoice(invoice: StripeRecord): string[] {
  const lines = asRecord(invoice.lines);
  if (!lines || !Array.isArray(lines.data)) return [];

  const ids: string[] = [];
  for (const line of lines.data) {
    const lineRecord = asRecord(line);
    const priceRecord = asRecord(lineRecord?.price);
    const priceId = trimToNull(priceRecord?.id);
    if (priceId) {
      ids.push(priceId);
    }
  }

  return ids;
}

export function extractPriceIdsFromCheckoutSession(
  session: StripeRecord
): string[] {
  const lineItems = asRecord(session.line_items);
  if (!lineItems || !Array.isArray(lineItems.data)) return [];

  const ids: string[] = [];
  for (const item of lineItems.data) {
    const itemRecord = asRecord(item);
    const priceRecord = asRecord(itemRecord?.price);
    const priceId =
      trimToNull(priceRecord?.id) ??
      (typeof itemRecord?.price === "string"
        ? trimToNull(itemRecord.price)
        : null);
    if (priceId) {
      ids.push(priceId);
    }
  }

  return ids;
}

export function extractInvoicePeriodEnd(invoice: StripeRecord): string | null {
  const lines = asRecord(invoice.lines);
  if (lines && Array.isArray(lines.data)) {
    for (const line of lines.data) {
      const lineRecord = asRecord(line);
      const period = asRecord(lineRecord?.period);
      const linePeriodEnd = unixSecondsToIso(period?.end);
      if (linePeriodEnd) {
        return linePeriodEnd;
      }
    }
  }

  return unixSecondsToIso(invoice.period_end);
}

export function toPatch(input: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  plan?: BillingPlan | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}): BillingAccountPatch {
  const patch: BillingAccountPatch = {};

  if (input.stripeCustomerId !== undefined) {
    patch.stripe_customer_id = input.stripeCustomerId;
  }
  if (input.stripeSubscriptionId !== undefined) {
    patch.stripe_subscription_id = input.stripeSubscriptionId;
  }
  if (input.plan !== undefined) {
    patch.plan = input.plan;
  }
  if (input.status !== undefined) {
    patch.status = input.status;
  }
  if (input.currentPeriodEnd !== undefined) {
    patch.current_period_end = input.currentPeriodEnd;
  }
  if (input.cancelAtPeriodEnd !== undefined) {
    patch.cancel_at_period_end = input.cancelAtPeriodEnd;
  }

  return patch;
}
