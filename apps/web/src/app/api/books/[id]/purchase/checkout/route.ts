import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { canUserReadBook } from "@/lib/books/access";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";
import { logAnalyticsEvent } from "@/lib/analytics/events";

function getBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.endsWith("/") ? fromEnv.slice(0, -1) : fromEnv;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function normalizeCurrency(value: unknown): string {
  const normalized = String(value ?? "USD").trim().toUpperCase();
  return normalized || "USD";
}

function normalizeAmount(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.trunc(value));
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, title, author_id, status, price_amount, price_currency")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    return NextResponse.json({ error: bookError.message }, { status: 500 });
  }

  if (!book || (book.status && book.status !== "PUBLISHED")) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const authorId = String((book as { author_id?: string | null }).author_id ?? "");
  const amount = normalizeAmount((book as { price_amount?: number | null }).price_amount);
  const currency = normalizeCurrency((book as { price_currency?: string | null }).price_currency);

  if (authorId === user.id) {
    return NextResponse.json({ error: "Authors cannot buy their own books" }, { status: 400 });
  }

  if (amount <= 0) {
    return NextResponse.json({ error: "Book is free" }, { status: 400 });
  }

  const hasAccess = await canUserReadBook({
    supabase,
    userId: user.id,
    bookId,
    bookAuthorId: authorId,
    bookPriceAmount: amount,
  });

  if (hasAccess) {
    return NextResponse.json({ error: "Already unlocked" }, { status: 409 });
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
    return NextResponse.json({ error: orderError?.message ?? "Could not create order" }, { status: 500 });
  }

  const orderId = String((order as { id: string }).id);
  const baseUrl = getBaseUrl(request);

  await logAnalyticsEvent(admin, {
    eventType: "purchase_attempt",
    userId: user.id,
    bookId,
    path: `/reader/books/${bookId}`,
    props: { provider: "stripe", orderId },
  });

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

    return NextResponse.json({
      checkoutUrl: session.url,
      orderId,
      provider: "stripe",
    });
  } catch (error) {
    await admin
      .from("orders" as never)
      .update({ status: "failed" })
      .eq("id", orderId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout session failed" },
      { status: 500 }
    );
  }
}
