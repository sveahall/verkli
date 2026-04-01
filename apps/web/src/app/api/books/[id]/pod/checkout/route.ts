import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { createPodCheckoutSession, getStripeCheckoutSession } from "@/lib/payments/stripe";
import { logAnalyticsEvent } from "@/lib/analytics/events";
import {
  normalizePrintOnDemandSettings,
  type BookFormat,
} from "@/lib/print-on-demand";
import {
  apiError,
  E_UNAUTHORIZED,
  E_BOOK_NOT_FOUND,
  E_AUTHOR_CANNOT_BUY_OWN_BOOK,
  E_CHECKOUT_START_FAILED,
  E_CHECKOUT_SESSION_FAILED,
  E_POD_NOT_ENABLED,
  E_POD_FORMAT_UNAVAILABLE,
  E_POD_PRICE_NOT_SET,
  E_INVALID_REQUEST_BODY,
  E_INVALID_BOOK_ID,
  isValidUuid,
} from "@/lib/api-errors";

type PodBookRow = {
  id: string;
  title: string;
  author_id: string | null;
  status: string | null;
  print_on_demand_settings: unknown;
};

function getBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.endsWith("/") ? fromEnv.slice(0, -1) : fromEnv;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  // Parse format from request body
  let format: BookFormat | null = null;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body === "object" && typeof body.format === "string") {
      const f = body.format.trim().toLowerCase();
      if (f === "softcover" || f === "hardcover") {
        format = f;
      }
    }
  } catch {
    // invalid body
  }

  if (!format) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const { data: rawBook, error: bookError } = await supabase
    .from("books")
    .select("id, title, author_id, status, print_on_demand_settings")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[pod.checkout] book lookup failed", {
      bookId,
      userId: user.id,
      code: bookError.code,
      message: bookError.message,
    });
    return apiError(E_CHECKOUT_START_FAILED, 500);
  }

  const book = rawBook as PodBookRow | null;
  if (!book || (book.status && book.status !== "PUBLISHED")) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const podSettings = normalizePrintOnDemandSettings(book.print_on_demand_settings);

  if (!podSettings.enabled) {
    return apiError(E_POD_NOT_ENABLED, 400);
  }

  if (!podSettings.formats.includes(format)) {
    return apiError(E_POD_FORMAT_UNAVAILABLE, 400);
  }

  const priceMinor =
    format === "softcover" ? podSettings.softcoverPriceMinor : podSettings.hardcoverPriceMinor;

  if (!priceMinor || priceMinor <= 0) {
    return apiError(E_POD_PRICE_NOT_SET, 400);
  }

  const currency = podSettings.priceCurrency;

  const authorId = String(book.author_id ?? "");
  if (authorId === user.id) {
    return apiError(E_AUTHOR_CANNOT_BUY_OWN_BOOK, 400);
  }

  const admin = createAdminClient();

  // ── Server-side idempotency: reuse pending pod_order if session still open ──
  try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: existingOrder } = await admin
      .from("pod_orders" as never)
      .select("id, stripe_session_id")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .eq("format", format)
      .eq("status", "pending")
      .not("stripe_session_id", "is", null)
      .gte("created_at", thirtyMinAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existing = existingOrder as { id: string; stripe_session_id: string } | null;
    if (existing?.stripe_session_id) {
      const existingSession = await getStripeCheckoutSession(existing.stripe_session_id);
      if (existingSession?.url && existingSession?.status === "open") {
        return NextResponse.json({
          checkoutUrl: existingSession.url,
          podOrderId: existing.id,
          provider: "stripe",
          amount: priceMinor,
          currency,
        });
      }
    }
  } catch (err) {
    console.warn("[pod.checkout] idempotency check failed, continuing", {
      bookId,
      userId: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const { data: order, error: orderError } = await admin
    .from("pod_orders" as never)
    .insert({
      user_id: user.id,
      book_id: bookId,
      format,
      amount: priceMinor,
      currency,
      provider: "stripe",
      status: "pending",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    console.error("[pod.checkout] pod_order insert failed", {
      bookId,
      userId: user.id,
      code: orderError?.code,
      message: orderError?.message,
    });
    return apiError(E_CHECKOUT_START_FAILED, 500);
  }

  const podOrderId = String((order as { id: string }).id);
  const baseUrl = getBaseUrl(request);

  try {
    await logAnalyticsEvent(admin, {
      eventType: "pod_purchase_attempt",
      userId: user.id,
      bookId,
      path: `/reader/books/${bookId}`,
      props: { provider: "stripe", podOrderId, format, amount: priceMinor, currency },
    });
  } catch (error) {
    console.warn("[pod.checkout] analytics pod_purchase_attempt failed", {
      bookId,
      userId: user.id,
      podOrderId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const session = await createPodCheckoutSession({
      amountMinor: priceMinor,
      currency,
      userId: user.id,
      bookId,
      podOrderId,
      format,
      bookTitle: String(book.title ?? "Book"),
      customerEmail: user.email,
      successUrl: `${baseUrl}/reader/books/${bookId}/pod/success?session_id={CHECKOUT_SESSION_ID}&pod_order_id=${encodeURIComponent(podOrderId)}`,
      cancelUrl: `${baseUrl}/reader/books/${bookId}/pod/cancel?pod_order_id=${encodeURIComponent(podOrderId)}`,
    });

    const stripeSessionId = String(session.id ?? "").trim();
    if (!stripeSessionId) {
      throw new Error("Stripe session id is missing");
    }

    const { error: orderUpdateError } = await admin
      .from("pod_orders" as never)
      .update({ stripe_session_id: stripeSessionId })
      .eq("id", podOrderId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (orderUpdateError) {
      throw new Error(`Failed to persist stripe_session_id: ${orderUpdateError.message}`);
    }

    return NextResponse.json({
      checkoutUrl: session.url,
      podOrderId,
      provider: "stripe",
      amount: priceMinor,
      currency,
    });
  } catch (error) {
    await admin
      .from("pod_orders" as never)
      .update({ status: "failed" })
      .eq("id", podOrderId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    console.error("[pod.checkout] stripe session failed", {
      bookId,
      userId: user.id,
      podOrderId,
      message: error instanceof Error ? error.message : String(error),
    });

    return apiError(E_CHECKOUT_SESSION_FAILED, 500);
  }
}
