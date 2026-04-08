import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRolePlanFromPriceIds } from "@/lib/billing/catalog";
import {
  getBillingAccountByStripeCustomerId,
  getBillingAccountByStripeSubscriptionId,
  upsertBillingAccount,
  type BillingAccountPatch,
  type BillingAccountRow,
} from "@/lib/billing/server";
import {
  parseBillingPlan,
  planToPersist,
  type BillingPlan,
} from "@/lib/billing/plans";
import {
  extractInvoicePeriodEnd,
  extractMetadata,
  extractPriceIdsFromCheckoutSession,
  extractPriceIdsFromInvoice,
  extractPriceIdsFromSubscription,
  extractStripeId,
  isPaidCheckoutSession,
  parsePaymentKindFromMetadata,
  toPatch,
  trimToNull,
  unixSecondsToIso,
  type FinalizeCheckoutFunction,
  type StripeRecord,
} from "./stripeWebhook.helpers";

type AdminClient = ReturnType<typeof createAdminClient>;

export type StripeWebhookResponseBody =
  | { received: true; processed: boolean }
  | { received: true; ignored: true };

async function findBillingAccountByRefs(
  admin: AdminClient,
  customerId: string | null,
  subscriptionId: string | null
): Promise<BillingAccountRow | null> {
  if (subscriptionId) {
    const bySubscription = await getBillingAccountByStripeSubscriptionId(
      admin,
      subscriptionId
    );
    if (bySubscription.error) {
      throw new Error(
        `Subscription lookup failed: ${bySubscription.error.message}`
      );
    }
    if (bySubscription.row) {
      return bySubscription.row;
    }
  }

  if (customerId) {
    const byCustomer = await getBillingAccountByStripeCustomerId(
      admin,
      customerId
    );
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
  admin: AdminClient,
  userId: string,
  role: "reader" | "author",
  patch: BillingAccountPatch
): Promise<void> {
  console.info("[billing-upsert]", {
    userId,
    role,
    plan: patch.plan,
    status: patch.status,
  });
  const { error } = await upsertBillingAccount(admin, userId, role, patch);
  if (error) {
    throw new Error(error.message);
  }
}

async function finalizeCheckoutSession(
  admin: AdminClient,
  rpcName: FinalizeCheckoutFunction,
  session: StripeRecord
): Promise<boolean> {
  const sessionId = trimToNull(session.id);
  if (!sessionId || !isPaidCheckoutSession(session)) {
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
  admin: AdminClient,
  session: StripeRecord
): Promise<boolean> {
  return finalizeCheckoutSession(admin, "finalize_order_checkout_session", session);
}

async function processDonationCheckoutSession(
  admin: AdminClient,
  session: StripeRecord
): Promise<boolean> {
  return finalizeCheckoutSession(
    admin,
    "finalize_donation_checkout_session",
    session
  );
}

async function processCreditTopupCheckoutSession(
  admin: AdminClient,
  session: StripeRecord
): Promise<boolean> {
  return finalizeCheckoutSession(
    admin,
    "finalize_credit_topup_checkout_session",
    session
  );
}

async function processTranslationCheckoutSession(
  session: StripeRecord
): Promise<boolean> {
  if (!isPaidCheckoutSession(session)) {
    return false;
  }

  const metadata = extractMetadata(session.metadata);
  console.info("[stripe.webhook] translation payment completed", {
    sessionId: trimToNull(session.id),
    userId: metadata.user_id,
    bookId: metadata.book_id,
    languages: metadata.languages,
  });

  return true;
}

async function processPodCheckoutSession(
  admin: AdminClient,
  session: StripeRecord
): Promise<boolean> {
  if (!isPaidCheckoutSession(session)) {
    return false;
  }

  const metadata = extractMetadata(session.metadata);
  const podOrderId = trimToNull(metadata.pod_order_id);
  const sessionId = trimToNull(session.id);

  if (!podOrderId || !sessionId) {
    console.warn(
      "[stripe.webhook] pod payment missing pod_order_id or session_id",
      { sessionId, metadata }
    );
    return false;
  }

  const { error } = await admin
    .from("pod_orders" as never)
    .update({
      status: "paid",
      stripe_session_id: sessionId,
      shipping_address: session.shipping_details ?? null,
    })
    .eq("id", podOrderId)
    .eq("status", "pending");

  if (error) {
    console.error("[stripe.webhook] pod order update failed", {
      podOrderId,
      sessionId,
      code: error.code,
      message: error.message,
    });
    return false;
  }

  console.info("[stripe.webhook] pod payment completed", {
    sessionId,
    podOrderId,
    userId: metadata.user_id,
    bookId: metadata.book_id,
    format: metadata.format,
  });

  return true;
}

async function processPaymentKindCheckoutSession(
  admin: AdminClient,
  session: StripeRecord
): Promise<{ handled: boolean; processed: boolean }> {
  const metadata = extractMetadata(session.metadata);
  const paymentKind = parsePaymentKindFromMetadata(metadata);
  if (!paymentKind) {
    return { handled: false, processed: false };
  }

  if (paymentKind === "donation") {
    return {
      handled: true,
      processed: await processDonationCheckoutSession(admin, session),
    };
  }

  if (paymentKind === "translation") {
    return {
      handled: true,
      processed: await processTranslationCheckoutSession(session),
    };
  }

  if (paymentKind === "audiobook") {
    if (isPaidCheckoutSession(session)) {
      const audiobookMetadata = extractMetadata(session.metadata);
      console.info("[stripe.webhook] audiobook payment completed", {
        sessionId: trimToNull(session.id),
        userId: audiobookMetadata.user_id,
        bookId: audiobookMetadata.book_id,
      });
    }
    return { handled: true, processed: isPaidCheckoutSession(session) };
  }

  if (paymentKind === "pod") {
    return {
      handled: true,
      processed: await processPodCheckoutSession(admin, session),
    };
  }

  if (paymentKind === "author_subscription") {
    return {
      handled: true,
      processed: await processAuthorSubscriptionCheckoutSession(admin, session),
    };
  }

  return {
    handled: true,
    processed: await processCreditTopupCheckoutSession(admin, session),
  };
}

async function processAuthorSubscriptionCheckoutSession(
  admin: AdminClient,
  session: StripeRecord
): Promise<boolean> {
  const metadata = extractMetadata(session.metadata);
  const subscriberUserId = trimToNull(metadata.subscriber_user_id);
  const authorId = trimToNull(metadata.author_id);
  const amountMonthlyStr = trimToNull(metadata.amount_monthly);
  const currency = trimToNull(metadata.currency) ?? "sek";
  const subscriptionId = extractStripeId(session.subscription);
  const customerId = extractStripeId(session.customer);

  if (!subscriberUserId || !authorId || !subscriptionId) {
    console.warn("[stripe.webhook] author_subscription missing required metadata", {
      sessionId: trimToNull(session.id),
      subscriberUserId,
      authorId,
      subscriptionId,
    });
    return false;
  }

  const amountMonthly = parseInt(amountMonthlyStr ?? "0", 10) || 0;

  const { error } = await admin.rpc("upsert_author_subscription" as never, {
    p_subscriber_user_id: subscriberUserId,
    p_author_id: authorId,
    p_stripe_subscription_id: subscriptionId,
    p_stripe_customer_id: customerId ?? null,
    p_amount_monthly: amountMonthly,
    p_currency: currency,
    p_status: "active",
    p_current_period_start: null,
    p_current_period_end: null,
  } as never);

  if (error) {
    console.error("[stripe.webhook] upsert_author_subscription failed", {
      subscriberUserId,
      authorId,
      message: error.message,
      code: error.code,
    });
    return false;
  }

  console.info("[stripe.webhook] author subscription activated", {
    subscriberUserId,
    authorId,
    subscriptionId,
    amountMonthly,
    currency,
  });

  return true;
}

async function processSubscriptionCheckoutSession(
  admin: AdminClient,
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

  const existing = await findBillingAccountByRefs(
    admin,
    customerId,
    subscriptionId
  );
  const userId = trimToNull(metadata.user_id) ?? existing?.user_id ?? null;
  if (!userId) {
    return false;
  }

  const priceIds = extractPriceIdsFromCheckoutSession(session);
  const resolved =
    priceIds.length > 0 ? await resolveRolePlanFromPriceIds(priceIds) : null;

  if (!resolved) {
    if (priceIds.length > 0) {
      console.warn(
        "[stripe.webhook] could not resolve role/plan from price ids, skipping billing update",
        { eventId, priceIds }
      );
    }
    return true;
  }

  const derivedStatus =
    trimToNull(session.payment_status) === "paid"
      ? "active"
      : trimToNull(session.status) ?? existing?.status ?? null;
  const existingPlan = parseBillingPlan(existing?.plan);
  const plan = planToPersist(
    resolved.planKey as BillingPlan,
    derivedStatus,
    existingPlan
  );

  await persistBillingAccount(
    admin,
    userId,
    resolved.role,
    toPatch({
      stripeCustomerId: customerId ?? existing?.stripe_customer_id ?? null,
      stripeSubscriptionId:
        subscriptionId ?? existing?.stripe_subscription_id ?? null,
      plan: plan ?? undefined,
      status: derivedStatus ?? undefined,
    })
  );

  return true;
}

async function processSubscriptionEvent(
  admin: AdminClient,
  subscription: StripeRecord,
  eventId: string,
  isDeleted: boolean
): Promise<boolean> {
  const subscriptionId = trimToNull(subscription.id);
  const customerId = extractStripeId(subscription.customer);
  const metadata = extractMetadata(subscription.metadata);

  const existing = await findBillingAccountByRefs(
    admin,
    customerId,
    subscriptionId
  );
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
        currentPeriodEnd:
          unixSecondsToIso(subscription.current_period_end) ?? undefined,
        cancelAtPeriodEnd: false,
      })
    );
    return true;
  }

  if (!resolved) {
    console.warn(
      "[stripe.webhook] could not resolve role/plan from price ids, skipping billing update",
      { eventId, priceIds }
    );
    return true;
  }

  const existingPlan = parseBillingPlan(existing?.plan);
  const plan = planToPersist(
    resolved.planKey as BillingPlan,
    derivedStatus,
    existingPlan
  );

  await persistBillingAccount(
    admin,
    userId,
    resolved.role,
    toPatch({
      stripeCustomerId: customerId ?? existing?.stripe_customer_id ?? null,
      stripeSubscriptionId:
        subscriptionId ?? existing?.stripe_subscription_id ?? null,
      plan: plan ?? undefined,
      status: derivedStatus ?? existing?.status ?? undefined,
      currentPeriodEnd:
        unixSecondsToIso(subscription.current_period_end) ?? undefined,
      cancelAtPeriodEnd:
        typeof subscription.cancel_at_period_end === "boolean"
          ? subscription.cancel_at_period_end
          : existing?.cancel_at_period_end,
    })
  );

  return true;
}

async function processInvoiceEvent(
  admin: AdminClient,
  invoice: StripeRecord,
  eventId: string,
  type: string
): Promise<boolean> {
  const customerId = extractStripeId(invoice.customer);
  const subscriptionId = extractStripeId(invoice.subscription);
  const metadata = extractMetadata(invoice.metadata);

  const existing = await findBillingAccountByRefs(
    admin,
    customerId,
    subscriptionId
  );
  const userId = trimToNull(metadata.user_id) ?? existing?.user_id ?? null;
  if (!userId) {
    return false;
  }

  const priceIds = extractPriceIdsFromInvoice(invoice);
  const resolved = await resolveRolePlanFromPriceIds(priceIds);

  if (!resolved) {
    if (priceIds.length > 0) {
      console.warn(
        "[stripe.webhook] could not resolve role/plan from price ids, skipping billing update",
        { eventId, priceIds }
      );
    }
    return true;
  }

  const derivedStatus =
    type === "invoice.payment_failed" ? "past_due" : "active";
  const existingPlan = parseBillingPlan(existing?.plan);
  const plan = planToPersist(
    resolved.planKey as BillingPlan,
    derivedStatus,
    existingPlan
  );

  await persistBillingAccount(
    admin,
    userId,
    resolved.role,
    toPatch({
      stripeCustomerId: customerId ?? existing?.stripe_customer_id ?? null,
      stripeSubscriptionId:
        subscriptionId ?? existing?.stripe_subscription_id ?? null,
      plan: plan ?? undefined,
      status: derivedStatus,
      currentPeriodEnd: extractInvoicePeriodEnd(invoice) ?? undefined,
      cancelAtPeriodEnd: existing?.cancel_at_period_end,
    })
  );

  return true;
}

export async function processStripeWebhookEvent(
  admin: AdminClient,
  type: string,
  eventId: string,
  object: StripeRecord
): Promise<StripeWebhookResponseBody> {
  switch (type) {
    case "checkout.session.completed": {
      const paymentKindResult = await processPaymentKindCheckoutSession(
        admin,
        object
      );
      if (paymentKindResult.handled) {
        return { received: true, processed: paymentKindResult.processed };
      }

      const bookProcessed = await processBookPurchaseCheckoutSession(
        admin,
        object
      );
      // Only attempt subscription processing if the book purchase handler
      // did not claim this session — avoids double-processing.
      if (bookProcessed) {
        return { received: true, processed: true };
      }
      const subscriptionProcessed = await processSubscriptionCheckoutSession(
        admin,
        object,
        eventId
      );
      return {
        received: true,
        processed: subscriptionProcessed,
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return {
        received: true,
        processed: await processSubscriptionEvent(admin, object, eventId, false),
      };
    case "customer.subscription.deleted":
      return {
        received: true,
        processed: await processSubscriptionEvent(admin, object, eventId, true),
      };
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
      return {
        received: true,
        processed: await processInvoiceEvent(admin, object, eventId, type),
      };
    default:
      return { received: true, ignored: true };
  }
}

export async function recordStripeEvent(
  admin: AdminClient,
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

  throw new Error(
    `stripe_events insert failed (${error.code}): ${error.message}`
  );
}

export async function rollbackStripeEvent(
  admin: AdminClient,
  eventId: string
): Promise<void> {
  const { error } = await admin
    .from("stripe_events" as never)
    .delete()
    .eq("stripe_event_id", eventId);

  if (error) {
    throw new Error(
      `stripe_events rollback failed (${error.code}): ${error.message}`
    );
  }
}
