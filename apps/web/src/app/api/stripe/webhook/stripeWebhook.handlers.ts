import { createAdminClient } from "@/lib/supabase/admin";
import { HANDLED_STRIPE_EVENTS } from "./stripeWebhook.events";
import { notifyPodFulfillment } from "@/lib/payments/pod-fulfillment-email";
import { sendBookDownloadEmail } from "@/lib/payments/book-download-email";
import {
  claimPaidOrderForReceipt,
  sendPurchaseReceipt,
} from "@/lib/payments/purchase-receipt";
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
import type { Json } from "@/lib/supabase/types";

// Re-exported so callers already importing it from here keep working.
export { HANDLED_STRIPE_EVENTS };

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Stripe does NOT include `line_items` in the `checkout.session.completed`
 * event body — it must be fetched with `listLineItems` (or via `expand`).
 * This resolver is injected so tests can stub it out.
 */
export type SessionLineItemsResolver = (
  sessionId: string
) => Promise<readonly StripeRecord[]>;

async function resolvePriceIdsForCheckoutSession(
  session: StripeRecord,
  resolveLineItems?: SessionLineItemsResolver
): Promise<string[]> {
  const inline = extractPriceIdsFromCheckoutSession(session);
  if (inline.length > 0 || !resolveLineItems) return inline;

  const sessionId = trimToNull(session.id);
  if (!sessionId) return [];

  try {
    const items = await resolveLineItems(sessionId);
    if (!items || items.length === 0) return [];

    const ids: string[] = [];
    for (const item of items) {
      const price = item?.price;
      if (price && typeof price === "object") {
        const priceId = trimToNull((price as StripeRecord).id);
        if (priceId) ids.push(priceId);
      } else if (typeof price === "string") {
        const priceId = trimToNull(price);
        if (priceId) ids.push(priceId);
      }
    }
    return ids;
  } catch (error) {
    console.error("[stripe.webhook] listLineItems failed", {
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

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

  // All three finalize functions take exactly `{ p_stripe_session_id: string }`
  // and return boolean (verified in types.ts). `.rpc()` cannot resolve a single
  // Args type from a union of names, so the name is narrowed to one member —
  // which keeps the ARGUMENT type-checked. The previous `rpcName as never`
  // erased both, so a renamed parameter here would have compiled fine and
  // failed at runtime.
  const { data, error } = await admin.rpc(rpcName as "finalize_order_checkout_session", {
    p_stripe_session_id: sessionId,
  });

  if (error) {
    throw new Error(`${rpcName} failed (${error.code}): ${error.message}`);
  }

  return data === true;
}

/**
 * Record the PaymentIntent on the order.
 *
 * This is the only link from a later `charge.refunded` or
 * `charge.dispute.created` back to this order: those events carry a charge,
 * and metadata is set on the Checkout Session only — `payment_intent_data`
 * is never passed — so without this column a refund has nothing to match on.
 *
 * Deliberately not fatal. Failing the purchase because we could not write a
 * column used only by a possible future refund would turn a paid customer
 * into a Stripe retry loop. It logs loudly instead, because the consequence
 * of losing it is a refund that cannot revoke access automatically.
 */
async function recordPaymentIntentForOrder(
  admin: AdminClient,
  sessionId: string,
  session: StripeRecord
): Promise<void> {
  const paymentIntentId = extractStripeId(session.payment_intent);
  if (!paymentIntentId) return;

  const { error } = await admin
    .from("orders")
    .update({ stripe_payment_intent_id: paymentIntentId })
    .eq("stripe_session_id", sessionId);

  if (error) {
    console.error("[stripe.webhook] could not link payment_intent to order", {
      sessionId,
      paymentIntentId,
      code: error.code,
      message: error.message,
      consequence: "a refund or dispute on this charge will not revoke access automatically",
    });
  }
}

async function processBookPurchaseCheckoutSession(
  admin: AdminClient,
  session: StripeRecord
): Promise<boolean> {
  const sessionId = trimToNull(session.id);

  // Only a genuinely paid session gets a receipt. A delayed-notification method
  // arrives here first as `completed` with payment_status "unpaid" — that is a
  // `processing` purchase, and emailing a receipt for it would be a lie.
  if (!sessionId || !isPaidCheckoutSession(session)) {
    return finalizeCheckoutSession(admin, "finalize_order_checkout_session", session);
  }

  // Before the claim, so the refund link exists even if a later step throws
  // and Stripe retries. Updating by stripe_session_id, which is already set —
  // the order row was created at checkout, not here.
  await recordPaymentIntentForOrder(admin, sessionId, session);

  // Claim BEFORE finalizing: the RPC returns true on every call, so it cannot
  // tell us whether this delivery is the one that completed the purchase.
  // See lib/payments/purchase-receipt.ts for why this is the idempotency token.
  const receiptClaim = await claimPaidOrderForReceipt(admin, sessionId);

  const processed = await finalizeCheckoutSession(
    admin,
    "finalize_order_checkout_session",
    session
  );

  if (receiptClaim && processed) {
    // Awaited, not fire-and-forget. On a request-scoped or serverless runtime the
    // detached promise can be killed the moment this handler returns — and by then
    // the order is already `paid` and the receipt claim is consumed, so every
    // Stripe retry re-finalizes nothing and the receipt is lost for good.
    // Safe to await: sendPurchaseReceipt catches its own provider errors and
    // resolves void, so a dead email provider still cannot fail a paid purchase.
    await sendPurchaseReceipt(admin, receiptClaim);
  }

  return processed;
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

  const shippingAddress =
    (session.shipping_details as Record<string, unknown> | null) ?? null;

  const { data: updated, error } = await admin
    .from("pod_orders")
    .update({
      status: "paid",
      stripe_session_id: sessionId,
      // The value is Stripe's shipping_details object, i.e. JSON by
      // construction; its declared type is Record<string, unknown> because it
      // came off an untyped Stripe payload.
      shipping_address: shippingAddress as Json,
    })
    .eq("id", podOrderId)
    .eq("status", "pending")
    .select("id, user_id, book_id, format, amount, currency")
    .maybeSingle();

  if (error) {
    // Transient DB failure — THROW so the webhook rolls back the idempotency
    // row and returns 500, letting Stripe retry. Returning false here would
    // leave the event recorded and 200, so the paid POD order would never be
    // marked paid and no retry would ever reach it.
    console.error("[stripe.webhook] pod order update failed", {
      podOrderId,
      sessionId,
      code: error.code,
      message: error.message,
    });
    throw new Error(
      `pod_orders update failed (${error.code}): ${error.message}`
    );
  }

  console.info("[stripe.webhook] pod payment completed", {
    sessionId,
    podOrderId,
    userId: metadata.user_id,
    bookId: metadata.book_id,
    format: metadata.format,
  });

  if (updated) {
    const row = updated as Record<string, unknown>;
    // Fire-and-forget: manual-fulfillment email to the operator inbox. Errors
    // inside notifyPodFulfillment are logged, never thrown.
    void notifyPodFulfillment(admin, {
      podOrderId: String(row.id ?? podOrderId),
      bookId: String(row.book_id ?? metadata.book_id ?? ""),
      userId: String(row.user_id ?? metadata.user_id ?? ""),
      format: typeof row.format === "string" ? row.format : null,
      amountMinor: typeof row.amount === "number" ? row.amount : null,
      currency: typeof row.currency === "string" ? row.currency : null,
      stripeSessionId: sessionId,
      shippingAddress:
        (shippingAddress as unknown as Parameters<
          typeof notifyPodFulfillment
        >[1]["shippingAddress"]) ?? null,
    });
  }

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

  if (paymentKind === "book_order") {
    // Printed copies are fulfilled manually from Stripe. Paid downloads also
    // need a durable return link, so closing the success page cannot lose it.
    if (isPaidCheckoutSession(session)) {
      const orderMetadata = extractMetadata(session.metadata);
      if (orderMetadata.order_variant === "ebook") {
        await sendBookDownloadEmail(session);
      }
      console.info("[stripe.webhook] book_order payment completed", {
        sessionId: trimToNull(session.id),
        email: orderMetadata.ship_name ? trimToNull(session.customer_email) : null,
      });
    }
    return { handled: true, processed: isPaidCheckoutSession(session) };
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

  const { error } = await admin.rpc("upsert_author_subscription", {
    p_subscriber_user_id: subscriberUserId,
    p_author_id: authorId,
    p_stripe_subscription_id: subscriptionId,
    // The SQL parameter is a plain `text`, so NULL is valid. The type
    // generator cannot express a nullable RPC argument — every non-defaulted
    // parameter comes out as required and non-nullable — so the assertion is
    // narrowed to this one field rather than erasing the whole call, which is
    // what the previous `as never` on the arguments object did.
    p_stripe_customer_id: (customerId ?? null) as string,
    p_amount_monthly: amountMonthly,
    p_currency: currency,
    p_status: "active",
    // p_current_period_start / p_current_period_end omitted deliberately: both
    // are `DEFAULT NULL` in SQL, so passing an explicit null said the same
    // thing in a way the generated optional type rejects.
  });

  if (error) {
    // Transient DB failure — THROW so Stripe retries (see the pod handler note).
    // Returning false would silently drop a paid author-subscription activation.
    console.error("[stripe.webhook] upsert_author_subscription failed", {
      subscriberUserId,
      authorId,
      message: error.message,
      code: error.code,
    });
    throw new Error(
      `upsert_author_subscription failed (${error.code}): ${error.message}`
    );
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
  eventId: string,
  resolveLineItems?: SessionLineItemsResolver
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

  const priceIds = await resolvePriceIdsForCheckoutSession(
    session,
    resolveLineItems
  );
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

/**
 * Terminal reconciliation for `async_payment_failed` and `expired`.
 *
 * Enabling Stripe's dynamic payment methods (see `lib/payments/stripe.ts`) means
 * delayed-notification methods can now reach this integration. Such a session
 * arrives as `completed` + `payment_status: "unpaid"`, is correctly acknowledged
 * as `processed: false`, and then resolves later — either through
 * `async_payment_succeeded` (handled in the main switch) or through one of these
 * two terminal events.
 *
 * Without this handler the pending row stays `pending` **forever**: nothing else
 * in the system reconciles it, so the buyer is left with a stuck order and the
 * revenue figures count a sale that never happened.
 *
 * Guarded to `status = "pending"` so a row already finalized as paid can never
 * be downgraded by a late or out-of-order terminal event.
 */
async function failPendingCheckoutSession(
  admin: AdminClient,
  session: StripeRecord,
  eventType: string
): Promise<boolean> {
  const sessionId = trimToNull(session.id);
  if (!sessionId) return false;

  const metadata = extractMetadata(session.metadata);
  const paymentKind = parsePaymentKindFromMetadata(metadata);

  // All four of these tables carry a `stripe_session_id` column and the same
  // pending/paid/failed status vocabulary. A book purchase is the one kind that
  // sets no `payment_kind` at all, which is why null maps to `orders` — the same
  // fall-through that `processPaymentKindCheckoutSession` relies on.
  const table =
    paymentKind === null
      ? ("orders" as const)
      : paymentKind === "donation"
        ? ("donations" as const)
        : paymentKind === "credit_topup"
          ? ("credit_topups" as const)
          : paymentKind === "pod"
            ? ("pod_orders" as const)
            : null;

  if (!table) {
    // audiobook / translation / author_subscription have no pending row to
    // reconcile — their entitlement is claimed at generate time, after payment,
    // via `stripe_session_redemptions`. An unpaid session simply never claims.
    console.info("[stripe.webhook] terminal session event, nothing to reconcile", {
      eventType,
      sessionId,
      paymentKind,
    });
    return false;
  }

  const { data, error } = await admin
    .from(table)
    .update({ status: "failed" })
    .eq("stripe_session_id", sessionId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    // Throw rather than return false, so the recorded `stripe_events` row is
    // rolled back and Stripe retries. Same contract as the paid-path handlers.
    throw new Error(
      `failPendingCheckoutSession ${table} (${error.code}): ${error.message}`
    );
  }

  const affected = Array.isArray(data) ? data.length : 0;
  console.info("[stripe.webhook] pending payment marked failed", {
    eventType,
    sessionId,
    paymentKind: paymentKind ?? "book_purchase",
    table,
    affected,
  });
  return affected > 0;
}

export async function processStripeWebhookEvent(
  admin: AdminClient,
  type: string,
  eventId: string,
  object: StripeRecord,
  resolveLineItems?: SessionLineItemsResolver
): Promise<StripeWebhookResponseBody> {
  switch (type) {
    // `async_payment_succeeded` fires when a delayed-payment method (Klarna,
    // SEPA, etc.) finally clears — the original `completed` event arrived
    // unpaid and was acknowledged as processed:false. It carries a distinct
    // event id (so it is not a duplicate) and a now-paid session, so route it
    // through the exact same finalize path to actually apply the purchase.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
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
        eventId,
        resolveLineItems
      );
      return {
        received: true,
        processed: subscriptionProcessed,
      };
    }
    // The two terminal outcomes for a delayed payment. Before dynamic payment
    // methods these were unreachable in practice; now they are not, and an
    // unhandled one leaves the row `pending` forever. See
    // `failPendingCheckoutSession` above.
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      return {
        received: true,
        processed: await failPendingCheckoutSession(admin, object, type),
      };
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
    // Money going back to the buyer, by our hand or the card network's.
    // Without these two cases both fell to `default` below and were
    // acknowledged with a 200 while the reader kept the book.
    case "charge.refunded":
    case "charge.dispute.created":
      return {
        received: true,
        processed: await processChargeRevocationEvent(admin, object, type),
      };
    case "account.updated":
      return {
        received: true,
        processed: await processAccountUpdatedEvent(admin, object),
      };
    default:
      return { received: true, ignored: true };
  }
}

/**
 * Revoke access when money goes back to the buyer.
 *
 * Two events, one outcome. `charge.refunded` is us giving the money back;
 * `charge.dispute.created` is the card network taking it, whether we agree or
 * not. Before this existed both fell through the switch's `default` and were
 * acknowledged with a 200, so a refunded reader kept the book forever.
 *
 * PARTIAL REFUNDS DO NOT REVOKE. `charge.refunded` also fires when only part
 * of the amount is returned, and pulling the book for a partial goodwill
 * refund would be wrong. Stripe sets `refunded: true` only on a full refund;
 * the amount comparison is a second check in case that flag is absent on an
 * older API version.
 *
 * The RPC does the work in one transaction — see
 * 20260907230000_refund_revokes_access.sql for why the entitlement delete and
 * the status change must not be separable.
 */
async function processChargeRevocationEvent(
  admin: AdminClient,
  object: StripeRecord,
  type: "charge.refunded" | "charge.dispute.created"
): Promise<boolean> {
  // A Dispute carries `payment_intent` alongside `charge`; a Charge carries
  // `payment_intent` directly. Both shapes may be a string or an expanded
  // object, which extractStripeId handles.
  const paymentIntentId = extractStripeId(object.payment_intent);

  if (!paymentIntentId) {
    console.error("[stripe.webhook] revocation event without a payment_intent", {
      type,
      chargeId: extractStripeId(object.id),
      consequence: "cannot identify the order; access must be revoked by hand",
    });
    return false;
  }

  if (type === "charge.refunded") {
    const amount = typeof object.amount === "number" ? object.amount : null;
    const refunded =
      typeof object.amount_refunded === "number" ? object.amount_refunded : null;
    const fullyRefunded =
      object.refunded === true || (amount !== null && refunded !== null && refunded >= amount);

    if (!fullyRefunded) {
      console.info("[stripe.webhook] partial refund — access left in place", {
        paymentIntentId,
        amount,
        amountRefunded: refunded,
      });
      return false;
    }
  }

  const kind = type === "charge.dispute.created" ? "dispute" : "refund";

  const { data, error } = await admin.rpc("revoke_order_for_refund", {
    p_payment_intent_id: paymentIntentId,
    p_kind: kind,
  }
  );

  if (error) {
    // THROW, so the webhook returns 500 and Stripe retries. Swallowing this
    // leaves a refunded buyer with access and no second attempt — the same
    // silent outcome as having no handler at all.
    throw new Error(
      `revoke_order_for_refund failed (${error.code}): ${error.message}`
    );
  }

  const revoked = data === true;
  if (!revoked) {
    // No matching order, or already revoked by the other event on the same
    // charge. Both are expected; neither is an error.
    console.info("[stripe.webhook] revocation was a no-op", {
      type,
      paymentIntentId,
      reason: "no order for this payment_intent, or already refunded",
    });
  } else {
    console.info("[stripe.webhook] access revoked", { type, paymentIntentId, kind });
  }

  return revoked;
}

// Stripe Connect account state changed — sync our cache row and emit audit
// events on the transitions that matter (KYC submitted, payouts enabled).
// This handler is called from the main switch above for `account.updated`.
export async function processAccountUpdatedEvent(
  admin: AdminClient,
  object: StripeRecord
): Promise<boolean> {
  const accountId = trimToNull((object as { id?: unknown }).id);
  if (!accountId) return false;

  // Lazy import to keep the webhook entrypoint lean and avoid pulling Stripe
  // SDK into the cold-start path when we only need the helper's DB writes.
  const [{ applyAccountUpdated }, { recordAudit }] = await Promise.all([
    import("@/lib/payments/stripe-connect"),
    import("@/lib/audit"),
  ]);

  const result = await applyAccountUpdated(
    admin,
    object as unknown as import("stripe").default.Account
  );
  if (!result.userId) {
    // Account ID is not ours — Stripe routes account.updated to all platforms
    // an account is connected to, so this is an expected no-op.
    return false;
  }

  const before = result.before;
  const after = result.after;
  if (!before || !after) return false;

  // Emit audit on the meaningful transitions, not on every requirements blip.
  if (!before.details_submitted && after.details_submitted) {
    void recordAudit(admin, {
      action: "billing.connect_kyc_submitted",
      target: { type: "billing_account", id: result.userId },
      after: { stripe_account_id: accountId, country: after.country },
    });
  }
  if (!before.payouts_enabled && after.payouts_enabled) {
    void recordAudit(admin, {
      action: "billing.connect_payouts_enabled",
      target: { type: "billing_account", id: result.userId },
      after: { stripe_account_id: accountId },
    });
  } else if (before.payouts_enabled && !after.payouts_enabled) {
    void recordAudit(admin, {
      action: "billing.connect_payouts_disabled",
      target: { type: "billing_account", id: result.userId },
      before: { payouts_enabled: true },
      after: { payouts_enabled: false, requirements: after.requirements },
    });
  } else if (
    JSON.stringify(before.requirements ?? null) !==
    JSON.stringify(after.requirements ?? null)
  ) {
    void recordAudit(admin, {
      action: "billing.connect_requirements_changed",
      target: { type: "billing_account", id: result.userId },
      before: { requirements: before.requirements },
      after: { requirements: after.requirements },
    });
  }

  return true;
}

export async function recordStripeEvent(
  admin: AdminClient,
  eventId: string,
  type: string
): Promise<"recorded" | "duplicate"> {
  const { error } = await admin.from("stripe_events").insert({
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
    .from("stripe_events")
    .delete()
    .eq("stripe_event_id", eventId);

  if (error) {
    throw new Error(
      `stripe_events rollback failed (${error.code}): ${error.message}`
    );
  }
}
