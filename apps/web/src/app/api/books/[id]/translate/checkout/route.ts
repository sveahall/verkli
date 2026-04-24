import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuthorRoleForApi } from "@/lib/auth/require-author"
import { isTranslationsEnabled } from "@/lib/flags"
import { isSupportedLanguage } from "@/lib/languages"
import { isTranslationPairSupported } from "@/lib/translation-pairs"
import { createTranslationCheckoutSession } from "@/lib/payments/stripe"
import { createPerUserRateLimiter } from "@/lib/rate-limit"
import { getRequestBaseUrl } from "@/lib/request-url"
import {
  apiError,
  E_TRANSLATION_FEATURE_DISABLED,
  E_INVALID_REQUEST_BODY,
  E_BOOK_NOT_FOUND,
  E_FORBIDDEN,
  E_TRANSLATION_CHECKOUT_FAILED,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors"

const checkoutLimiter = createPerUserRateLimiter({ maxPerMinute: 5 })

export const runtime = "nodejs"

/** Price per language in SEK minor units (199 kr = 19900 öre). */
const PRICE_PER_LANGUAGE_MINOR = 19900
const CURRENCY = "SEK"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isTranslationsEnabled()) {
    return apiError(E_TRANSLATION_FEATURE_DISABLED, 403)
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

  const rawLanguages = Array.isArray(body.languages) ? (body.languages as unknown[]) : []
  const sourceVersionId =
    typeof body.sourceVersionId === "string" ? body.sourceVersionId.trim() : ""

  if (rawLanguages.length === 0 || !sourceVersionId) {
    return apiError(E_INVALID_REQUEST_BODY, 400, {
      detail: "languages (array) and sourceVersionId are required",
    })
  }

  // Validate & deduplicate languages
  const validLanguages: string[] = []
  const seen = new Set<string>()
  for (const raw of rawLanguages) {
    if (typeof raw !== "string") continue
    const code = raw.trim().toLowerCase()
    if (!code || seen.has(code) || !isSupportedLanguage(code)) continue
    seen.add(code)
    validLanguages.push(code)
  }

  if (validLanguages.length === 0) {
    return apiError(E_INVALID_REQUEST_BODY, 400, {
      detail: "No valid target languages provided",
    })
  }

  // Verify the book belongs to this user and get source language
  const supabase = await createClient()
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id, original_language, language")
    .eq("id", bookId)
    .maybeSingle()

  if (bookError || !book) {
    return apiError(E_BOOK_NOT_FOUND, 404)
  }
  if (book.author_id !== user.id) {
    return apiError(E_FORBIDDEN, 403)
  }

  const sourceLanguage = String(
    book.original_language ?? book.language ?? ""
  ).trim().toLowerCase()

  // Verify translation pairs
  for (const lang of validLanguages) {
    if (!isTranslationPairSupported(sourceLanguage, lang)) {
      return apiError(E_INVALID_REQUEST_BODY, 400, {
        detail: `Translation pair ${sourceLanguage} -> ${lang} is not supported`,
      })
    }
  }

  const amountMinor = PRICE_PER_LANGUAGE_MINOR * validLanguages.length
  const baseUrl = getRequestBaseUrl(request)
  const languagesParam = validLanguages.join(",")

  const successUrl = `${baseUrl}/author/books/${bookId}/editor?panel=translate&translation_checkout=success&session_id={CHECKOUT_SESSION_ID}&languages=${encodeURIComponent(languagesParam)}`
  const cancelUrl = `${baseUrl}/author/books/${bookId}/editor?panel=translate&translation_checkout=cancel`

  try {
    const session = await createTranslationCheckoutSession({
      amountMinor,
      currency: CURRENCY,
      userId: user.id,
      bookId,
      languages: languagesParam,
      sourceVersionId,
      sourceLanguage,
      customerEmail: user.email,
      successUrl,
      cancelUrl,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("[translate.checkout] failed", {
      userId: user.id,
      bookId,
      languages: languagesParam,
      message: error instanceof Error ? error.message : String(error),
    })
    return apiError(E_TRANSLATION_CHECKOUT_FAILED, 500)
  }
}
