import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { canUserReadBook, lookupBookPurchaseEntitlement } from "@/lib/books/access";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";
import { checkBookCheckoutAttempts } from "@/lib/payments/checkout-attempts";
import { isCheckoutIdentifier, isUsableCheckoutUrl } from "@/lib/payments/checkout-status-url";
import { logAnalyticsEvent } from "@/lib/analytics/events";
import { toBookPricing, isPaidPriceAmount } from "@/lib/books/pricing";
import { getRequestBaseUrl } from "@/lib/request-url";
import {
  apiError,
  E_UNAUTHORIZED,
  E_BOOK_NOT_FOUND,
  E_INVALID_BOOK_PRICING,
  E_AUTHOR_CANNOT_BUY_OWN_BOOK,
  E_BOOK_IS_FREE,
  E_ALREADY_UNLOCKED,
  E_CHECKOUT_PAYMENT_RECORDED,
  E_CHECKOUT_PROCESSING,
  E_CHECKOUT_UNAVAILABLE,
  E_CHECKOUT_HISTORY_UNAVAILABLE,
  E_CHAPTER_CHECKOUT_UNAVAILABLE,
  E_INVALID_BOOK_ID,
  isValidUuid,
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  assertPublicEnv();
  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(E_UNAUTHORIZED, 401);

  const unavailable = (reason: string) => {
    console.error("[purchase.checkout] checkout unavailable", { reason });
    return apiError(E_CHECKOUT_UNAVAILABLE, 503);
  };

  try {
    const body: unknown = await request.json().catch(() => null);
    const chapterRequested = body !== null && typeof body === "object" && Object.hasOwn(body, "chapter_id");
    const { data: rawBook, error: bookError } = await supabase
      .from("books")
      .select("id, title, author_id, status, price_amount, price_currency, pricing_model")
      .eq("id", bookId)
      .maybeSingle();
    if (bookError) return unavailable("book_lookup_failed");

    const book = rawBook as CheckoutBookRow | null;
    if (!book || book.id !== bookId || (book.status && book.status !== "PUBLISHED")) {
      return apiError(E_BOOK_NOT_FOUND, 404);
    }
    const pricing = toBookPricing({
      priceAmount: book.price_amount,
      priceCurrency: book.price_currency,
      pricingModel: book.pricing_model ?? "book_only",
    });
    if (!pricing || (pricing.pricingModel !== "book_only" && pricing.pricingModel !== "per_chapter")) {
      console.error("[purchase.checkout] invalid book pricing", { reason: "invalid_book_pricing" });
      return apiError(E_INVALID_BOOK_PRICING, 422);
    }
    const authorId = String(book.author_id ?? "");
    if (authorId === user.id) return apiError(E_AUTHOR_CANNOT_BUY_OWN_BOOK, 400);
    if (!isPaidPriceAmount(pricing.priceAmount)) return apiError(E_BOOK_IS_FREE, 400);
    if (chapterRequested || pricing.pricingModel === "per_chapter") {
      return apiError(E_CHAPTER_CHECKOUT_UNAVAILABLE, 503);
    }

    const entitlement = await lookupBookPurchaseEntitlement({ supabase, userId: user.id, bookId });
    if (entitlement.status === "present") return apiError(E_ALREADY_UNLOCKED, 409);
    if (entitlement.status === "unavailable") return unavailable("entitlement_lookup_unavailable");
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
    if (hasAccess) return apiError(E_ALREADY_UNLOCKED, 409);

    const admin = createAdminClient();
    const previous = await checkBookCheckoutAttempts(admin, user.id, bookId);
    if (previous.status === "reuse") {
      return NextResponse.json({
        checkoutUrl: previous.checkoutUrl,
        orderId: previous.order.id,
        provider: "stripe",
        amount: previous.order.amount,
        currency: previous.order.currency,
      });
    }
    if (previous.status !== "clear") {
      console.warn("[purchase.checkout] previous purchase blocks checkout", { reason: previous.reason });
      const key = previous.status === "recorded" ? E_CHECKOUT_PAYMENT_RECORDED
        : previous.status === "processing" ? E_CHECKOUT_PROCESSING
        : previous.status === "history_limit" ? E_CHECKOUT_HISTORY_UNAVAILABLE : E_CHECKOUT_UNAVAILABLE;
      return apiError(key, previous.status === "recorded" || previous.status === "processing" ? 409 : 503, {
        ...(previous.status === "history_limit" ? { reason: "history_verification_limit" } : {}),
        ...(previous.purchaseStatusUrl ? { purchaseStatusUrl: previous.purchaseStatusUrl } : {}),
      });
    }

    // From the first insertion onwards, a lost response is an uncertain attempt.
    // Keep it pending and withhold payment navigation until binding is confirmed.
    try {
      const { data: order, error: orderError } = await admin
        .from("orders" as never)
        .insert({ user_id: user.id, book_id: bookId, amount, currency, provider: "stripe", status: "pending" })
        .select("id")
        .single();
      const orderId = (order as { id?: unknown } | null)?.id;
      if (orderError || !isCheckoutIdentifier(orderId)) throw new Error("order_insert_unconfirmed");
      const baseUrl = getRequestBaseUrl(request);
      try {
        await logAnalyticsEvent(admin, {
          eventType: "purchase_attempt",
          userId: user.id,
          bookId,
          path: `/reader/books/${bookId}`,
          props: { provider: "stripe", orderId, amount, currency, pricingModel: pricing.pricingModel },
        });
      } catch {
        console.warn("[purchase.checkout] analytics unavailable", { reason: "purchase_attempt_analytics_failed" });
      }
      const session = await createStripeCheckoutSession({
        amount,
        currency,
        bookTitle: String(book.title ?? "Book"),
        customerEmail: user.email,
        successUrl: `${baseUrl}/reader/books/${bookId}/purchase/success?session_id={CHECKOUT_SESSION_ID}&order_id=${encodeURIComponent(orderId)}`,
        cancelUrl: `${baseUrl}/reader/books/${bookId}/purchase/cancel?order_id=${encodeURIComponent(orderId)}`,
        metadata: { orderId, userId: user.id, bookId, paymentType: "book_purchase", amountMinor: amount },
      });
      if (!session || !isCheckoutIdentifier(session.id) || !isUsableCheckoutUrl(session.url)) {
        throw new Error("session_creation_unconfirmed");
      }
      const { data: boundOrder, error: bindError } = await admin
        .from("orders" as never)
        .update({ stripe_session_id: session.id })
        .eq("id", orderId)
        .eq("user_id", user.id)
        .eq("book_id", bookId)
        .eq("status", "pending")
        .is("stripe_session_id", null)
        .select("id")
        .maybeSingle();
      if (bindError || (boundOrder as { id?: unknown } | null)?.id !== orderId) {
        throw new Error("session_binding_unconfirmed");
      }
      return NextResponse.json({ checkoutUrl: session.url, orderId, provider: "stripe", amount, currency });
    } catch {
      console.error("[purchase.checkout] checkout creation unconfirmed", { reason: "new_attempt_unconfirmed" });
      return apiError(E_CHECKOUT_PROCESSING, 409);
    }
  } catch {
    return unavailable("checkout_verification_unavailable");
  }
}
