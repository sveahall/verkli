import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBillingPlan, planToPersist, type BillingPlan } from "@/lib/billing/plans";
import { resolveRolePlanFromPriceIds } from "@/lib/billing/catalog";
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

type PaymentKind = "donation" | "credit_topup";

type FinalizeCheckoutFunction =
  | "finalize_order_checkout_session"
  | "finalize_donation_checkout_session"
  | "finalize_credit_topup_checkout_session";

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

function parsePaymentKind(value: unknown): PaymentKind | null {
  const normalized = trimToNull(value)?.toLowerCase();
  if (normalized === "donation") {
    return "donation";
  }
  if (normalized === "credit_topup" || normalized === "credit-topup") {
    return "credit_topup";
  }
  return null;
}

function parsePaymentKindFromMetadata(metadata: Record<string, string>): PaymentKind | null {
  return parsePaymentKind(metadata.payment_kind ?? metadata.payment_type);
}

function isPaidCheckoutSession(session: StripeRecord): boolean {
  return trimToNull(session.payment_status) === "paid";
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

function extractPriceIdsFromCheckoutSession(session: StripeRecord): string[] {
  const lineItems = asRecord(session.line_items);
  if (!lineItems || !Array.isArray(lineItems.data)) return [];

  const ids: string[] = [];
  for (const item of lineItems.data) {
    const itemRecord = asRecord(item);
    const priceRecord = asRecord(itemRecord?.price);
    const priceId = trimToNull(priceRecord?.id) ?? (typeof itemRecord?.price === "string" ? trimToNull(itemRecord.price) : null);
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
  role: "reader" | "author",
  patch: BillingAccountPatch
): Promise<void> {
  console.log("[billing-upsert]", { userId, role, plan: patch.plan, status: patch.status });
  const { error } = await upsertBillingAccount(admin, userId, role, patch);
  if (error) {
    throw new Error(error.message);
  }
}

async function finalizeCheckoutSession(
  admin: ReturnType<typeof createAdminClient>,
  rpcName: FinalizeCheckoutFunction,
  session: StripeRecord
): Promise<boolean> {
  const sessionId = trimToNull(session.id);
  if (!sessionId) {
    return false;
  }

  if (!isPaidCheckoutSession(session)) {
    return false;
  }

  const { data, error } = await admin.rpc(rpcName as never, {
    p_stripe_session_id: sessionId,
  });

  if (error) {
    throw new Error(`${rpcName} failed (${error.code}): ${error.message}`);
  }

  return data === true;
}

async function processBookPurchaseCheckoutSession(
  admin: ReturnType<typeof createAdminClient>,
  session: StripeRecord
): Promise<boolean> {
  return finalizeCheckoutSession(admin, "finalize_order_checkout_session", session);
}

async function processDonationCheckoutSession(
  admin: ReturnType<typeof createAdminClient>,
  session: StripeRecord
): Promise<boolean> {
  return finalizeCheckoutSession(admin, "finalize_donation_checkout_session", session);
}

async function processCreditTopupCheckoutSession(
  admin: ReturnType<typeof createAdminClient>,
  session: StripeRecord
): Promise<boolean> {
  return finalizeCheckoutSession(admin, "finalize_credit_topup_checkout_session", session);
}

async function processPaymentKindCheckoutSession(
  admin: ReturnType<typeof createAdminClient>,
  session: StripeRecord
): Promise<{ handled: boolean; processed: boolean }> {
  const metadata = extractMetadata(session.metadata);
  const paymentKind = parsePaymentKindFromMetadata(metadata);
  if (!paymentKind) {
    return { handled: false, processed: false };
  }

  if (paymentKind === "donation") {
    const processed = await processDonationCheckoutSession(admin, session);
    return { handled: true, processed };
  }

  const processed = await processCreditTopupCheckoutSession(admin, session);
  return { handled: true, processed };
}

async function processSubscriptionCheckoutSession(
  admin: ReturnType<typeof createAdminClient>,
  session: StripeRecord,
  eventId: string
): Promise<boolean> {
  const mode = trimToNull(session.mode);
  const subscriptionId = extractStripeId(session.subscription);
  const customerId = extractStripeId(session.customer);
  const metadata = extractMetadata(session.metadata);

  if (mode !== "subscription" && !subscriptionId) {
    return false;
  }

  const existing = await findBillingAccountByRefs(admin, customerId, subscriptionId);
  const userId = trimToNull(metadata.user_id) ?? existing?.user_id ?? null;
  if (!userId) {
    return false;
  }

  const priceIds = extractPriceIdsFromCheckoutSession(session);
  const resolved = priceIds.length > 0 ? await resolveRolePlanFromPriceIds(priceIds) : null;

  if (!resolved) {
    if (priceIds.length > 0) {
      console.warn("[stripe.webhook] could not resolve role/plan from price ids, skipping billing update", {
        eventId,
        priceIds,
      });
    }
    return true;
  }

  const derivedStatus =
    trimToNull(session.payment_status) === "paid"
      ? "active"
      : trimToNull(session.status) ?? existing?.status ?? null;
  const existingPlan = parseBillingPlan(existing?.plan);
  const plan = planToPersist(resolved.planKey as BillingPlan, derivedStatus, existingPlan);

  await persistBillingAccount(
    admin,
    userId,
    resolved.role,
    toPatch({
      stripeCustomerId: customerId ?? existing?.stripe_customer_id ?? null,
      stripeSubscriptionId: subscriptionId ?? existing?.stripe_subscription_id ?? null,
      plan: plan ?? undefined,
      status: derivedStatus ?? undefined,
    })
  );

  return true;
}

async function processSubscriptionEvent(
  admin: ReturnType<typeof createAdminClient>,
  subscription: StripeRecord,
  eventId: string,
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

  const derivedStatus = trimToNull(subscription.status);

  const priceIds = extractPriceIdsFromSubscription(subscription);
  const resolved = await resolveRolePlanFromPriceIds(priceIds);

  if (isDeleted) {
    const role = existing?.role ?? resolved?.role ?? "reader";
    await persistBillingAccount(
      admin,
      userId,
      role,
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

  if (!resolved) {
    console.warn("[stripe.webhook] could not resolve role/plan from price ids, skipping billing update", {
      eventId,
      priceIds,
    });
    return true;
  }

  const existingPlan = parseBillingPlan(existing?.plan);
  const plan = planToPersist(resolved.planKey as BillingPlan, derivedStatus, existingPlan);

  await persistBillingAccount(
    admin,
    userId,
    resolved.role,
    toPatch({
      stripeCustomerId: customerId ?? existing?.stripe_customer_id ?? null,
      stripeSubscriptionId: subscriptionId ?? existing?.stripe_subscription_id ?? null,
      plan: plan ?? undefined,
      status: derivedStatus ?? existing?.status ?? undefined,
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
  eventId: string,
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

  const priceIds = extractPriceIdsFromInvoice(invoice);
  const resolved = await resolveRolePlanFromPriceIds(priceIds);

  if (!resolved) {
    if (priceIds.length > 0) {
      console.warn("[stripe.webhook] could not resolve role/plan from price ids, skipping billing update", {
        eventId,
        priceIds,
      });
    }
    return true;
  }

  const derivedStatus = type === "invoice.payment_failed" ? "past_due" : "active";
  const existingPlan = parseBillingPlan(existing?.plan);
  const plan = planToPersist(resolved.planKey as BillingPlan, derivedStatus, existingPlan);

  await persistBillingAccount(
    admin,
    userId,
    resolved.role,
    toPatch({
      stripeCustomerId: customerId ?? existing?.stripe_customer_id ?? null,
      stripeSubscriptionId: subscriptionId ?? existing?.stripe_subscription_id ?? null,
      plan: plan ?? undefined,
      status: derivedStatus,
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

async function rollbackStripeEvent(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string
): Promise<void> {
  const { error } = await admin
    .from("stripe_events" as never)
    .delete()
    .eq("stripe_event_id", eventId);

  if (error) {
    throw new Error(`stripe_events rollback failed (${error.code}): ${error.message}`);
  }
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

  const object = asRecord(event.data?.object);
  if (!object) {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    switch (type) {
      case "checkout.session.completed": {
        const paymentKindResult = await processPaymentKindCheckoutSession(admin, object);
        if (paymentKindResult.handled) {
          return NextResponse.json({
            received: true,
            processed: paymentKindResult.processed,
          });
        }

        const bookProcessed = await processBookPurchaseCheckoutSession(admin, object);
        const subscriptionProcessed = await processSubscriptionCheckoutSession(
          admin,
          object,
          eventId
        );
        return NextResponse.json({
          received: true,
          processed: bookProcessed || subscriptionProcessed,
        });
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const processed = await processSubscriptionEvent(admin, object, eventId, false);
        return NextResponse.json({ received: true, processed });
      }
      case "customer.subscription.deleted": {
        const processed = await processSubscriptionEvent(admin, object, eventId, true);
        return NextResponse.json({ received: true, processed });
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const processed = await processInvoiceEvent(admin, object, eventId, type);
        return NextResponse.json({ received: true, processed });
      }
      default:
        return NextResponse.json({ received: true, ignored: true });
    }
  } catch (error) {
    try {
      await rollbackStripeEvent(admin, eventId);
    } catch (rollbackError) {
      console.error("[stripe.webhook] failed to rollback idempotency event", {
        eventId,
        type,
        message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }

    console.error("[stripe.webhook] processing failed", {
      eventId,
      type,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_GENERIC_ERROR, 500);
  }
}
