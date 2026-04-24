import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { canUserReadBook } from "@/lib/books/access";
import { createStripeCheckoutSession, getStripeCheckoutSession } from "@/lib/payments/stripe";
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
  E_CHECKOUT_START_FAILED,
  E_CHECKOUT_SESSION_FAILED,
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

  // Parse optional chapter_id from request body
  let chapterId: string | null = null;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body === "object" && typeof body.chapter_id === "string" && body.chapter_id.trim()) {
      chapterId = body.chapter_id.trim();
    }
  } catch {
    // No body or invalid JSON — treat as book-level purchase
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

  if (pricing.pricingModel !== "book_only" && pricing.pricingModel !== "per_chapter") {
    return apiError(E_INVALID_BOOK_PRICING, 422);
  }

  // For per_chapter, chapter_id is required
  if (pricing.pricingModel === "per_chapter" && !chapterId) {
    return apiError(E_INVALID_BOOK_PRICING, 400);
  }

  // For book_only, chapter_id must be null
  if (pricing.pricingModel === "book_only") {
    chapterId = null;
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

  // Validate chapter belongs to the book and get its title
  let chapterTitle: string | null = null;
  if (chapterId) {
    const { data: chapter } = await supabase
      .from("chapters")
      .select("id, title, book_id")
      .eq("id", chapterId)
      .maybeSingle();

    if (!chapter || String((chapter as { book_id?: string }).book_id ?? "") !== bookId) {
      return apiError(E_BOOK_NOT_FOUND, 404);
    }
    chapterTitle = String((chapter as { title?: string }).title ?? "Chapter");
  }

  // Check existing access
  if (chapterId) {
    // For chapter purchase: check if user already has access to this chapter
    const { data: chapterEntitlement } = await supabase
      .from("entitlements")
      .select("id")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .eq("chapter_id", chapterId)
      .eq("source", "purchase")
      .maybeSingle();

    if (chapterEntitlement) {
      return apiError(E_ALREADY_UNLOCKED, 409);
    }

    // Also check book-level entitlement
    const { data: bookEntitlement } = await supabase
      .from("entitlements")
      .select("id")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .eq("source", "purchase")
      .is("chapter_id", null)
      .maybeSingle();

    if (bookEntitlement) {
      return apiError(E_ALREADY_UNLOCKED, 409);
    }
  } else {
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
  }

  const admin = createAdminClient();

  // ── Server-side idempotency: reuse pending checkout if session still open ──
  try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    let idempotencyQuery = admin
      .from("orders" as never)
      .select("id, stripe_session_id")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .eq("status", "pending")
      .not("stripe_session_id", "is", null)
      .gte("created_at", thirtyMinAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    if (chapterId) {
      idempotencyQuery = idempotencyQuery.eq("chapter_id", chapterId);
    } else {
      idempotencyQuery = idempotencyQuery.is("chapter_id", null);
    }

    const { data: existingOrder } = await idempotencyQuery.maybeSingle();

    const existing = existingOrder as { id: string; stripe_session_id: string } | null;
    if (existing?.stripe_session_id) {
      const existingSession = await getStripeCheckoutSession(existing.stripe_session_id);
      if (existingSession?.url && existingSession?.status === "open") {
        return NextResponse.json({
          checkoutUrl: existingSession.url,
          orderId: existing.id,
          provider: "stripe",
          amount,
          currency,
        });
      }
    }
  } catch (err) {
    console.warn("[purchase.checkout] idempotency check failed, continuing", {
      bookId,
      userId: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const orderPayload: Record<string, unknown> = {
    user_id: user.id,
    book_id: bookId,
    amount,
    currency,
    provider: "stripe",
    status: "pending",
  };
  if (chapterId) {
    orderPayload.chapter_id = chapterId;
  }

  const { data: order, error: orderError } = await admin
    .from("orders" as never)
    .insert(orderPayload)
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
  const baseUrl = getRequestBaseUrl(request);
  const productName = chapterTitle
    ? `${chapterTitle} — ${String(book.title ?? "Book")}`
    : String(book.title ?? "Book");

  try {
    await logAnalyticsEvent(admin, {
      eventType: "purchase_attempt",
      userId: user.id,
      bookId,
      path: `/reader/books/${bookId}`,
      props: { provider: "stripe", orderId, amount, currency, pricingModel: pricing.pricingModel, chapterId: chapterId ?? undefined },
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
    const metadata: Record<string, string | number> = {
      orderId,
      userId: user.id,
      bookId,
      paymentType: "book_purchase",
      amountMinor: amount,
    };
    if (chapterId) {
      metadata.chapterId = chapterId;
    }

    const session = await createStripeCheckoutSession({
      amount,
      currency,
      bookTitle: productName,
      customerEmail: user.email,
      successUrl: `${baseUrl}/reader/books/${bookId}/purchase/success?session_id={CHECKOUT_SESSION_ID}&order_id=${encodeURIComponent(orderId)}`,
      cancelUrl: `${baseUrl}/reader/books/${bookId}/purchase/cancel?order_id=${encodeURIComponent(orderId)}`,
      metadata: {
        orderId,
        userId: user.id,
        bookId,
        paymentType: "book_purchase",
        amountMinor: amount,
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
