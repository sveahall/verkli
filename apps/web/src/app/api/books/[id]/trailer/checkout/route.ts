import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuthorRoleForApi } from "@/lib/auth/require-author"
import { isMarketingEnabled } from "@/lib/flags"
import { createTrailerCheckoutSession } from "@/lib/payments/stripe"
import { createPerUserRateLimiter } from "@/lib/rate-limit"
import { getRequestBaseUrl } from "@/lib/request-url"
import {
  apiError,
  E_MARKETING_FEATURE_DISABLED,
  E_BOOK_NOT_FOUND,
  E_FORBIDDEN,
  E_CHECKOUT_SESSION_FAILED,
  E_RATE_LIMIT_EXCEEDED,
  E_INVALID_BOOK_ID,
  isValidUuid,
} from "@/lib/api-errors"

const checkoutLimiter = createPerUserRateLimiter({ maxPerMinute: 5 })

export const runtime = "nodejs"

/**
 * One-off "Book trailer" purchase. Mirrors the audiobook one-off flow: a
 * one-time Stripe checkout (inline price_data, no pre-created Stripe product)
 * that is redeemed once at trailer-generation time via
 * claimStripeSessionRedemption(kind: "trailer"). 99 kr SEK (~$9, roadmap).
 */
const PRICE_PER_TRAILER_MINOR = 9900
const CURRENCY = "SEK"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isMarketingEnabled()) {
    return apiError(E_MARKETING_FEATURE_DISABLED, 403)
  }

  const { user, response } = await requireAuthorRoleForApi()
  if (response) return response

  const rl = await checkoutLimiter.check(user.id)
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429)
  }

  const { id: bookId } = await params
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400)

  // Verify the book belongs to this user
  const supabase = await createClient()
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle()

  if (bookError || !book) {
    return apiError(E_BOOK_NOT_FOUND, 404)
  }
  if (book.author_id !== user.id) {
    return apiError(E_FORBIDDEN, 403)
  }

  const baseUrl = getRequestBaseUrl(request)
  const successUrl = `${baseUrl}/author/books/${bookId}/editor?panel=marketing&trailer_checkout=success&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${baseUrl}/author/books/${bookId}/editor?panel=marketing&trailer_checkout=cancel`

  try {
    const session = await createTrailerCheckoutSession({
      amountMinor: PRICE_PER_TRAILER_MINOR,
      currency: CURRENCY,
      userId: user.id,
      bookId,
      customerEmail: user.email,
      successUrl,
      cancelUrl,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("[trailer.checkout] failed", {
      userId: user.id,
      bookId,
      message: error instanceof Error ? error.message : String(error),
    })
    return apiError(E_CHECKOUT_SESSION_FAILED, 500)
  }
}
