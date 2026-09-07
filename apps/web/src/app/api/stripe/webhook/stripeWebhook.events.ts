// Deliberately import-free.
//
// scripts/check-stripe-webhook.ts loads this list to compare it against the
// live endpoint's subscription. Keeping it in stripeWebhook.handlers.ts would
// drag @/lib/supabase/admin and the rest of the server graph into a plain tsx
// script, so the list lives alone and handlers.ts re-exports it.

/**
 * Every Stripe event type the switch below acts on.
 *
 * This exists because a handler and a subscription are two separate facts, and
 * having one without the other fails silently in both directions:
 *
 *   handler, no subscription  — Stripe never sends it; the code is dead and
 *                               looks alive. `charge.refunded` shipped this way.
 *   subscription, no handler  — the event arrives and falls to `default`,
 *                               answered 200 and dropped.
 *
 * Two things keep this list honest: a test asserting each entry has a `case`
 * in the switch (stripeWebhook.events.test.ts), and
 * `npm run check:stripe-webhook`, which compares it against what the live
 * endpoint is actually subscribed to.
 */
export const HANDLED_STRIPE_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "account.updated",
] as const;
