import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_GENERIC_ERROR,
  E_INVALID_REQUEST_BODY,
} from "@/lib/api-errors";
import {
  asRecord,
  trimToNull,
  type StripeRecord,
  type StripeWebhookEvent,
} from "./stripeWebhook.helpers";
import {
  processStripeWebhookEvent,
  recordStripeEvent,
  rollbackStripeEvent,
} from "./stripeWebhook.handlers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripeSecretKey || !webhookSecret) {
    console.error(
      "[stripe.webhook] missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET"
    );
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

  const stripe = new Stripe(stripeSecretKey);
  let event: StripeWebhookEvent;
  try {
    const constructed = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );
    event = {
      id: constructed.id,
      type: constructed.type,
      data: {
        object: constructed.data.object,
      },
    };
  } catch (verifyError) {
    console.warn("[stripe.webhook] signature verification failed", {
      errorType:
        verifyError instanceof Error
          ? verifyError.constructor.name
          : "unknown",
      message:
        verifyError instanceof Error
          ? verifyError.message
          : String(verifyError),
    });
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

  // Stripe's `checkout.session.completed` payload never includes `line_items`.
  // Provide a resolver so the subscription handler can pull price ids via
  // `listLineItems` and actually persist the plan.
  const resolveLineItems = async (
    sessionId: string
  ): Promise<readonly StripeRecord[]> => {
    const result = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 100,
    });
    return (result?.data ?? []) as unknown as readonly StripeRecord[];
  };

  try {
    return NextResponse.json(
      await processStripeWebhookEvent(
        admin,
        type,
        eventId,
        object,
        resolveLineItems
      )
    );
  } catch (error) {
    try {
      await rollbackStripeEvent(admin, eventId);
    } catch (rollbackError) {
      console.error("[stripe.webhook] failed to rollback idempotency event", {
        eventId,
        type,
        message:
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
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
