import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuthorRoleForApi } from "@/lib/auth/require-author"
import { getAudiobookEnabled } from "@/lib/flags"
import { createAudiobookCheckoutSession } from "@/lib/payments/stripe"
import { resolveNarratorVoiceId } from "@/lib/tts/tts-provider"
import { createPerUserRateLimiter } from "@/lib/rate-limit"
import { getRequestBaseUrl } from "@/lib/request-url"
import {
  apiError,
  E_AUDIOBOOK_FEATURE_DISABLED,
  E_AUDIOBOOK_VOICE_UNCONFIGURED,
  E_INVALID_REQUEST_BODY,
  E_BOOK_NOT_FOUND,
  E_FORBIDDEN,
  E_CHECKOUT_SESSION_FAILED,
  E_RATE_LIMIT_EXCEEDED,
  E_INVALID_BOOK_ID,
  E_AUDIOBOOK_TOO_LONG,
  E_AUDIOBOOK_QUOTA_EXHAUSTED,
  E_AUDIOBOOK_QUOTA_UNKNOWN,
  E_BOOK_VERSION_NOT_FOUND_FOR_LANGUAGE,
  E_NO_CHAPTERS_FOR_VERSION,
  E_DATABASE_ERROR,
  isValidUuid,
} from "@/lib/api-errors"
import { sumChapterTextLength } from "@/lib/audiobook/chapter-text"
import { JobCostExceededError, validateJobCost } from "@/lib/workers/budget"
import { getRemainingCredits } from "@/lib/tts/elevenlabs-quota"

const checkoutLimiter = createPerUserRateLimiter({ maxPerMinute: 5 })

export const runtime = "nodejs"

/** Price for full audiobook generation in SEK minor units (299 kr = 29900 öre). */
const PRICE_PER_AUDIOBOOK_MINOR = 29900
const CURRENCY = "SEK"

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
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400)

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

  // Refuse before any money moves. The generate route runs the same guard, but
  // by the time it does, Stripe has already charged 299 SEK and redirected back
  // — and the client strips session_id from the URL, so the paid session cannot
  // be retried. This is the only guard that actually sits before the charge.
  if (!resolveNarratorVoiceId()) {
    console.error(
      "[audiobook.checkout] refusing checkout: no narrator voice configured. " +
        "Set ELEVENLABS_VOICE_ID (or TTS_VOICE_ID) to an ElevenLabs voice id."
    )
    return apiError(E_AUDIOBOOK_VOICE_UNCONFIGURED, 503, {
      detail: "Narrator voice is not configured for this deployment.",
    })
  }

  // Everything below refuses before the charge. The generate route and the
  // worker check the same three things, but they run after Stripe has taken 299
  // SEK and after the client has stripped session_id from the URL — so a failure
  // there is money gone with no retry. The voice guard above was the only
  // pre-charge check; these are the rest of them.
  const { data: version, error: versionError } = await supabase
    .from("book_versions")
    .select("id")
    .eq("book_id", bookId)
    .eq("language_code", language)
    .maybeSingle()

  if (versionError) {
    console.error("[audiobook.checkout] version lookup failed", {
      bookId,
      language,
      message: versionError.message,
    })
    return apiError(E_DATABASE_ERROR, 500)
  }
  if (!version) {
    return apiError(E_BOOK_VERSION_NOT_FOUND_FOR_LANGUAGE, 404)
  }

  const { data: chapters, error: chaptersError } = await supabase
    .from("chapters")
    .select("content")
    .eq("book_version_id", version.id)

  if (chaptersError) {
    console.error("[audiobook.checkout] chapter fetch failed", {
      bookId,
      versionId: version.id,
      message: chaptersError.message,
    })
    return apiError(E_DATABASE_ERROR, 500)
  }
  if (!chapters || chapters.length === 0) {
    return apiError(E_NO_CHAPTERS_FOR_VERSION, 404)
  }

  // Same counter and same cap the worker uses — see lib/audiobook/chapter-text.ts
  // for why that has to be one implementation rather than two.
  const totalCharacters = sumChapterTextLength(chapters)
  try {
    validateJobCost({
      userId: user.id,
      pipeline: "tts",
      jobSize: totalCharacters,
      jobId: `checkout:${bookId}:${language}`,
    })
  } catch (err) {
    if (err instanceof JobCostExceededError) {
      console.warn("[audiobook.checkout] refusing checkout: book over the narration cap", {
        bookId,
        language,
        characters: err.details.jobSize,
        cap: err.details.cap,
      })
      return apiError(E_AUDIOBOOK_TOO_LONG, 400, {
        detail: `This book narrates ${err.details.jobSize} characters; the current limit is ${err.details.cap}.`,
        characters: err.details.jobSize,
        limit: err.details.cap,
      })
    }
    throw err
  }

  // The cap above says how big a job may be; this says whether it can be paid
  // for. Separate limits, and the second one is what actually failed in
  // production on 2026-09-01 (ElevenLabs quota_exceeded, mid-job, after the
  // charge). Refusing on an unknown quota is deliberate: blocking a purchase for
  // a minute is a smaller harm than taking 299 SEK for narration that cannot run
  // and cannot be retried.
  const quota = await getRemainingCredits()
  if (quota.remaining === null) {
    console.error("[audiobook.checkout] refusing checkout: narration quota unverifiable", {
      bookId,
      reason: quota.reason,
    })
    return apiError(E_AUDIOBOOK_QUOTA_UNKNOWN, 503, {
      detail: "Narration capacity could not be verified. Nothing was charged.",
    })
  }
  if (quota.remaining < totalCharacters) {
    console.error("[audiobook.checkout] refusing checkout: not enough narration credits", {
      bookId,
      required: totalCharacters,
      remaining: quota.remaining,
    })
    return apiError(E_AUDIOBOOK_QUOTA_EXHAUSTED, 503, {
      detail: `This book needs ${totalCharacters} narration credits; ${quota.remaining} remain. Nothing was charged.`,
      required: totalCharacters,
      remaining: quota.remaining,
    })
  }

  const baseUrl = getRequestBaseUrl(request)
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
