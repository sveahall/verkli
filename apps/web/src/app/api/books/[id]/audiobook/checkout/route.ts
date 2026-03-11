import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuthorRoleForApi } from "@/lib/auth/require-author"
import { getAudiobookEnabled } from "@/lib/flags"
import { createAudiobookCheckoutSession } from "@/lib/payments/stripe"
import { createPerUserRateLimiter } from "@/lib/rate-limit"
import {
  apiError,
  E_AUDIOBOOK_FEATURE_DISABLED,
  E_INVALID_REQUEST_BODY,
  E_BOOK_NOT_FOUND,
  E_FORBIDDEN,
  E_CHECKOUT_SESSION_FAILED,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors"

const checkoutLimiter = createPerUserRateLimiter({ maxPerMinute: 5 })

export const runtime = "nodejs"

/** Price for full audiobook generation in SEK minor units (299 kr = 29900 öre). */
const PRICE_PER_AUDIOBOOK_MINOR = 29900
const CURRENCY = "SEK"

function getBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (fromEnv) {
    return fromEnv.endsWith("/") ? fromEnv.slice(0, -1) : fromEnv
  }
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getAudiobookEnabled()) {
    return apiError(E_AUDIOBOOK_FEATURE_DISABLED, 403)
  }

  const { user, response } = await requireAuthorRoleForApi()
  if (response) return response

  const rl = await checkoutLimiter.check(user.id)
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429)
  }

  const { id: bookId } = await params

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return apiError(E_INVALID_REQUEST_BODY, 400)
  }

  const language =
    typeof body.language === "string" ? body.language.trim().toLowerCase() : ""

  if (!language) {
    return apiError(E_INVALID_REQUEST_BODY, 400, {
      detail: "language is required",
    })
  }

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

  const baseUrl = getBaseUrl(request)
  const successUrl = `${baseUrl}/author/books/${bookId}/editor?panel=audiobook&audiobook_checkout=success&session_id={CHECKOUT_SESSION_ID}&lang=${encodeURIComponent(language)}`
  const cancelUrl = `${baseUrl}/author/books/${bookId}/editor?panel=audiobook&audiobook_checkout=cancel`

  try {
    const session = await createAudiobookCheckoutSession({
      amountMinor: PRICE_PER_AUDIOBOOK_MINOR,
      currency: CURRENCY,
      userId: user.id,
      bookId,
      language,
      customerEmail: user.email,
      successUrl,
      cancelUrl,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("[audiobook.checkout] failed", {
      userId: user.id,
      bookId,
      language,
      message: error instanceof Error ? error.message : String(error),
    })
    return apiError(E_CHECKOUT_SESSION_FAILED, 500)
  }
}
