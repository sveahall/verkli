import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { canUserReadBook } from "@/lib/books/access";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";
import { logAnalyticsEvent } from "@/lib/analytics/events";
import { toBookPricing, isPaidPriceAmount } from "@/lib/books/pricing";
import {
  apiError,
  E_UNAUTHORIZED,
  E_BOOK_NOT_FOUND,
  E_INVALID_BOOK_PRICING,
  E_AUTHOR_CANNOT_BUY_OWN_BOOK,
  E_BOOK_IS_FREE,
  E_ALREADY_UNLOCKED,
  E_CHECKOUT_START_FAILED,
  E_CHECKOUT_SESSION_FAILED,
} from "@/lib/api-errors";

type CheckoutBookRow = {
  id: string;
  title: string;
  author_id: string | null;
  status: string | null;
  price_amount: number | null;
  price_currency: string | null;
  pricing_model?: string | null;
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_UNAUTHORIZED, 401);
  }

  const { data: rawBook, error: bookError } = await supabase
    .from("books")
    .select("id, title, author_id, status, price_amount, price_currency, pricing_model")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[purchase.checkout] book lookup failed", {
      bookId,
      userId: user.id,
      code: bookError.code,
      message: bookError.message,
    });
    return apiError(E_CHECKOUT_START_FAILED, 500);
  }

  const book = rawBook as CheckoutBookRow | null;
  if (!book || (book.status && book.status !== "PUBLISHED")) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const pricing = toBookPricing({
    priceAmount: book.price_amount,
    priceCurrency: book.price_currency,
    pricingModel: book.pricing_model ?? "book_only",
  });

  if (!pricing) {
    console.error("[purchase.checkout] invalid pricing in DB", {
      bookId,
      userId: user.id,
      priceAmount: book.price_amount,
      priceCurrency: book.price_currency,
      pricingModel: book.pricing_model,
    });
    return apiError(E_INVALID_BOOK_PRICING, 422);
  }

  if (pricing.pricingModel !== "book_only") {
    console.error("[purchase.checkout] unsupported pricing model", {
      bookId,
      userId: user.id,
      pricingModel: pricing.pricingModel,
    });
    return apiError(E_INVALID_BOOK_PRICING, 422);
  }

  const authorId = String(book.author_id ?? "");
  if (authorId === user.id) {
    return apiError(E_AUTHOR_CANNOT_BUY_OWN_BOOK, 400);
  }

  if (!isPaidPriceAmount(pricing.priceAmount)) {
    return apiError(E_BOOK_IS_FREE, 400);
  }

  const amount = pricing.priceAmount;
  const currency = pricing.priceCurrency;

  const hasAccess = await canUserReadBook({
    supabase,
    userId: user.id,
    bookId,
    bookAuthorId: authorId,
    bookPriceAmount: amount,
    bookPricingModel: pricing.pricingModel,
  });

  if (hasAccess) {
    return apiError(E_ALREADY_UNLOCKED, 409);
  }

  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders" as never)
    .insert({
      user_id: user.id,
      book_id: bookId,
      amount,
      currency,
      provider: "stripe",
      status: "pending",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    console.error("[purchase.checkout] order insert failed", {
      bookId,
      userId: user.id,
      code: orderError?.code,
      message: orderError?.message,
    });
    return apiError(E_CHECKOUT_START_FAILED, 500);
  }

  const orderId = String((order as { id: string }).id);
  const baseUrl = getBaseUrl(request);

  try {
    await logAnalyticsEvent(admin, {
      eventType: "purchase_attempt",
      userId: user.id,
      bookId,
      path: `/reader/books/${bookId}`,
      props: { provider: "stripe", orderId, amount, currency, pricingModel: pricing.pricingModel },
    });
  } catch (error) {
    console.warn("[purchase.checkout] analytics purchase_attempt failed", {
      bookId,
      userId: user.id,
      orderId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const session = await createStripeCheckoutSession({
      amount,
      currency,
      bookTitle: String(book.title ?? "Book"),
      customerEmail: user.email,
      successUrl: `${baseUrl}/reader/books/${bookId}/purchase/success?session_id={CHECKOUT_SESSION_ID}&order_id=${encodeURIComponent(orderId)}`,
      cancelUrl: `${baseUrl}/reader/books/${bookId}/purchase/cancel?order_id=${encodeURIComponent(orderId)}`,
      metadata: {
        orderId,
        userId: user.id,
        bookId,
      },
    });

    const stripeSessionId = String(session.id ?? "").trim();
    if (!stripeSessionId) {
      throw new Error("Stripe session id is missing");
    }

    const { error: orderUpdateError } = await admin
      .from("orders" as never)
      .update({ stripe_session_id: stripeSessionId })
      .eq("id", orderId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (orderUpdateError) {
      throw new Error(`Failed to persist stripe_session_id: ${orderUpdateError.message}`);
    }

    return NextResponse.json({
      checkoutUrl: session.url,
      orderId,
      provider: "stripe",
      amount,
      currency,
    });
  } catch (error) {
    await admin
      .from("orders" as never)
      .update({ status: "failed" })
      .eq("id", orderId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    console.error("[purchase.checkout] stripe session failed", {
      bookId,
      userId: user.id,
      orderId,
      message: error instanceof Error ? error.message : String(error),
    });

    return apiError(E_CHECKOUT_SESSION_FAILED, 500);
  }
}
