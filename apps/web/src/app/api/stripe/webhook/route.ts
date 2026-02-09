import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingPriceConfig, getPlanFromPriceId, parseBillingPlan, type BillingPriceConfig, type BillingPlan } from "@/lib/billing/plans";
import {
  getBillingAccountByStripeCustomerId,
  getBillingAccountByStripeSubscriptionId,
  upsertBillingAccount,
  type BillingAccountPatch,
  type BillingAccountRow,
} from "@/lib/billing/server";
import { apiError, E_GENERIC_ERROR, E_INVALID_REQUEST_BODY } from "@/lib/api-errors";

export const runtime = "nodejs";

type StripeRecord = Record<string, unknown>;

type StripeWebhookEvent = {
  id?: string | null;
  type?: string | null;
  data?: {
    object?: unknown;
  } | null;
};

function asRecord(value: unknown): StripeRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as StripeRecord;
}

function trimToNull(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

function extractStripeId(value: unknown): string | null {
  if (typeof value === "string") {
    return trimToNull(value);
  }
  const record = asRecord(value);
  return record ? trimToNull(record.id) : null;
}

function extractMetadata(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};

  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === "string") {
      out[key] = val;
    }
  }
  return out;
}

function extractPriceIdsFromSubscription(subscription: StripeRecord): string[] {
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

function extractPriceIdsFromInvoice(invoice: StripeRecord): string[] {
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

function extractInvoicePeriodEnd(invoice: StripeRecord): string | null {
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

function resolvePlanFromPriceIds(
  priceIds: string[],
  priceConfig: BillingPriceConfig | null
): BillingPlan | null {
  if (!priceConfig) return null;

  for (const priceId of priceIds) {
    const plan = getPlanFromPriceId(priceId, priceConfig);
    if (plan) return plan;
  }

  return null;
}

function toPatch(input: {
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

async function findBillingAccountByRefs(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string | null,
  subscriptionId: string | null
): Promise<BillingAccountRow | null> {
  if (subscriptionId) {
    const bySubscription = await getBillingAccountByStripeSubscriptionId(admin, subscriptionId);
    if (bySubscription.error) {
      throw new Error(`Subscription lookup failed: ${bySubscription.error.message}`);
    }
    if (bySubscription.row) {
      return bySubscription.row;
    }
  }

  if (customerId) {
    const byCustomer = await getBillingAccountByStripeCustomerId(admin, customerId);
    if (byCustomer.error) {
      throw new Error(`Customer lookup failed: ${byCustomer.error.message}`);
    }
    if (byCustomer.row) {
      return byCustomer.row;
    }
  }

  return null;
}

async function persistBillingAccount(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  patch: BillingAccountPatch
): Promise<void> {
  const { error } = await upsertBillingAccount(admin, userId, patch);
  if (error) {
    throw new Error(error.message);
  }
}

async function processBookPurchaseCheckoutSession(
  admin: ReturnType<typeof createAdminClient>,
  session: StripeRecord
): Promise<boolean> {
  const sessionId = trimToNull(session.id);
  if (!sessionId) return false;

  if (trimToNull(session.payment_status) !== "paid") {
    return false;
  }

  const { data: order, error: orderError } = await admin
    .from("orders" as never)
    .select("id, user_id, book_id, status, stripe_session_id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (orderError) {
    throw new Error(`Order lookup failed (${orderError.code}): ${orderError.message}`);
  }

  const row = (order as { id?: string; user_id?: string | null; book_id?: string | null; status?: string | null } | null) ?? null;
  if (!row?.id || !row.user_id || !row.book_id) {
    return false;
  }

  if (row.status !== "paid") {
    const { error: updateError } = await admin
      .from("orders" as never)
      .update({ status: "paid" })
      .eq("id", row.id)
      .in("status", ["pending", "failed"]);

    if (updateError) {
      throw new Error(`Order update failed (${updateError.code}): ${updateError.message}`);
    }
  }

  const { error: entitlementError } = await admin
    .from("entitlements" as never)
    .upsert(
      {
        user_id: row.user_id,
        book_id: row.book_id,
        source: "purchase",
      },
      { onConflict: "user_id,book_id" }
    );

  if (entitlementError) {
    throw new Error(`Entitlement upsert failed (${entitlementError.code}): ${entitlementError.message}`);
  }

  return true;
}

async function processSubscriptionCheckoutSession(
  admin: ReturnType<typeof createAdminClient>,
  session: StripeRecord
): Promise<boolean> {
  const mode = trimToNull(session.mode);
  const subscriptionId = extractStripeId(session.subscription);
  const customerId = extractStripeId(session.customer);
  const metadata = extractMetadata(session.metadata);

  const planFromMetadata = parseBillingPlan(metadata.plan);

  if (mode !== "subscription" && !subscriptionId && !planFromMetadata) {
    return false;
  }

  const existing = await findBillingAccountByRefs(admin, customerId, subscriptionId);

  const userId = trimToNull(metadata.user_id) ?? existing?.user_id ?? null;
  if (!userId) {
    return false;
  }

  const status =
    trimToNull(session.payment_status) === "paid"
      ? "active"
      : trimToNull(session.status) ?? existing?.status ?? null;

  const plan = planFromMetadata ?? parseBillingPlan(existing?.plan);

  await persistBillingAccount(
    admin,
    userId,
    toPatch({
      stripeCustomerId: customerId ?? existing?.stripe_customer_id ?? null,
      stripeSubscriptionId: subscriptionId ?? existing?.stripe_subscription_id ?? null,
      plan: plan ?? undefined,
      status: status ?? undefined,
    })
  );

  return true;
}

async function processSubscriptionEvent(
  admin: ReturnType<typeof createAdminClient>,
  subscription: StripeRecord,
  priceConfig: BillingPriceConfig | null,
  isDeleted: boolean
): Promise<boolean> {
  const subscriptionId = trimToNull(subscription.id);
  const customerId = extractStripeId(subscription.customer);
  const metadata = extractMetadata(subscription.metadata);

  const existing = await findBillingAccountByRefs(admin, customerId, subscriptionId);

  const userId = trimToNull(metadata.user_id) ?? existing?.user_id ?? null;
  if (!userId) {
    return false;
  }

  const planFromMetadata = parseBillingPlan(metadata.plan);
  const planFromPrices = resolvePlanFromPriceIds(extractPriceIdsFromSubscription(subscription), priceConfig);
  const fallbackPlan = parseBillingPlan(existing?.plan);

  if (isDeleted) {
    await persistBillingAccount(
      admin,
      userId,
      toPatch({
        stripeCustomerId: customerId ?? existing?.stripe_customer_id ?? null,
        stripeSubscriptionId: null,
        plan: null,
        status: "canceled",
        currentPeriodEnd: unixSecondsToIso(subscription.current_period_end),
        cancelAtPeriodEnd: false,
      })
    );
    return true;
  }

  await persistBillingAccount(
    admin,
    userId,
    toPatch({
      stripeCustomerId: customerId ?? existing?.stripe_customer_id ?? null,
      stripeSubscriptionId: subscriptionId ?? existing?.stripe_subscription_id ?? null,
      plan: planFromMetadata ?? planFromPrices ?? fallbackPlan ?? undefined,
      status: trimToNull(subscription.status) ?? existing?.status ?? undefined,
      currentPeriodEnd: unixSecondsToIso(subscription.current_period_end) ?? undefined,
      cancelAtPeriodEnd:
        typeof subscription.cancel_at_period_end === "boolean"
          ? subscription.cancel_at_period_end
          : existing?.cancel_at_period_end,
    })
  );

  return true;
}

async function processInvoiceEvent(
  admin: ReturnType<typeof createAdminClient>,
  invoice: StripeRecord,
  priceConfig: BillingPriceConfig | null,
  type: string
): Promise<boolean> {
  const customerId = extractStripeId(invoice.customer);
  const subscriptionId = extractStripeId(invoice.subscription);
  const metadata = extractMetadata(invoice.metadata);

  const existing = await findBillingAccountByRefs(admin, customerId, subscriptionId);

  const userId = trimToNull(metadata.user_id) ?? existing?.user_id ?? null;
  if (!userId) {
    return false;
  }

  const planFromMetadata = parseBillingPlan(metadata.plan);
  const planFromPrices = resolvePlanFromPriceIds(extractPriceIdsFromInvoice(invoice), priceConfig);
  const fallbackPlan = parseBillingPlan(existing?.plan);

  const status = type === "invoice.payment_failed" ? "past_due" : "active";

  await persistBillingAccount(
    admin,
    userId,
    toPatch({
      stripeCustomerId: customerId ?? existing?.stripe_customer_id ?? null,
      stripeSubscriptionId: subscriptionId ?? existing?.stripe_subscription_id ?? null,
      plan: planFromMetadata ?? planFromPrices ?? fallbackPlan ?? undefined,
      status,
      currentPeriodEnd: extractInvoicePeriodEnd(invoice) ?? undefined,
      cancelAtPeriodEnd: existing?.cancel_at_period_end,
    })
  );

  return true;
}

async function recordStripeEvent(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  type: string
): Promise<"recorded" | "duplicate"> {
  const { error } = await admin.from("stripe_events" as never).insert({
    stripe_event_id: eventId,
    type,
  });

  if (!error) {
    return "recorded";
  }

  if (error.code === "23505") {
    return "duplicate";
  }

  throw new Error(`stripe_events insert failed (${error.code}): ${error.message}`);
}

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripeSecretKey || !webhookSecret) {
    console.error("[stripe.webhook] missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return apiError(E_GENERIC_ERROR, 500);
  }

  const rawBody = await request.text();
  if (!rawBody) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const signature = request.headers.get("stripe-signature")?.trim() ?? "";
  if (!signature) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  let event: StripeWebhookEvent;
  try {
    const stripe = new Stripe(stripeSecretKey);
    const constructed = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    event = {
      id: constructed.id,
      type: constructed.type,
      data: {
        object: constructed.data.object,
      },
    };
  } catch {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const eventId = trimToNull(event.id);
  const type = trimToNull(event.type);
  if (!eventId || !type) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const admin = createAdminClient();

  let eventState: "recorded" | "duplicate";
  try {
    eventState = await recordStripeEvent(admin, eventId, type);
  } catch (error) {
    console.error("[stripe.webhook] failed to persist event", {
      eventId,
      type,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_GENERIC_ERROR, 500);
  }

  if (eventState === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  let priceConfig: BillingPriceConfig | null = null;
  try {
    priceConfig = getBillingPriceConfig();
  } catch {
    // Some events do not require price mapping. Missing config is logged when needed.
  }

  const object = asRecord(event.data?.object);
  if (!object) {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    switch (type) {
      case "checkout.session.completed": {
        const bookProcessed = await processBookPurchaseCheckoutSession(admin, object);
        const subscriptionProcessed = await processSubscriptionCheckoutSession(admin, object);
        return NextResponse.json({
          received: true,
          processed: bookProcessed || subscriptionProcessed,
        });
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const processed = await processSubscriptionEvent(admin, object, priceConfig, false);
        return NextResponse.json({ received: true, processed });
      }
      case "customer.subscription.deleted": {
        const processed = await processSubscriptionEvent(admin, object, priceConfig, true);
        return NextResponse.json({ received: true, processed });
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const processed = await processInvoiceEvent(admin, object, priceConfig, type);
        return NextResponse.json({ received: true, processed });
      }
      default:
        return NextResponse.json({ received: true, ignored: true });
    }
  } catch (error) {
    console.error("[stripe.webhook] processing failed", {
      eventId,
      type,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_GENERIC_ERROR, 500);
  }
}
