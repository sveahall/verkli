import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enqueueTranslationJob } from "@/lib/translation-queue"
import { isSupportedLanguage } from "@/lib/languages"
import { assertPublicEnv } from "@/lib/env"
import { requireAuthorRoleForApi } from "@/lib/auth/require-author"
import { requireProBillingForApi } from "@/lib/billing/server"
import { isTranslationsEnabled } from "@/lib/flags"
import { getStripeCheckoutSession } from "@/lib/payments/stripe"
import { isTranslationPairSupported } from "@/lib/translation-pairs"
import {
  deleteBookTranslationState,
  resolveTranslationSourceContext,
  upsertBookTranslationState,
} from "@/lib/book-translation"
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_FORBIDDEN,
  E_INVALID_REQUEST_BODY,
  E_INVALID_SOURCE_VERSION,
  E_INVALID_TARGET_LANGUAGE,
  E_NO_SOURCE_VERSION,
  E_RATE_LIMIT_EXCEEDED,
  E_SAME_SOURCE_TARGET_LANGUAGE,
  E_SOURCE_LANGUAGE_MISSING,
  E_TRANSLATION_FEATURE_DISABLED,
  E_TRANSLATION_PAIR_UNSUPPORTED,
  E_TRANSLATION_SERVICE_UNAVAILABLE,
  E_VERSION_ALREADY_EXISTS,
  E_INVALID_BOOK_ID,
  isValidUuid,
} from "@/lib/api-errors"
import { createPerUserRateLimiter } from "@/lib/rate-limit"

const translateLimiter = createPerUserRateLimiter({ maxPerMinute: 5 })

type TranslationStartSuccess = {
  ok: true
  targetLanguage: string
  jobId: string
  targetVersionId: string | null
  chapterId: string | null
}

type TranslationStartFailure = {
  ok: false
  targetLanguage: string
  error: string
  status: number
  extra?: Record<string, unknown>
}

function parseRequestedLanguages(body: unknown): {
  requestedLanguages: string[]
  isBatchRequest: boolean
} {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const isBatchRequest = Array.isArray(record.languages)

  const rawLanguages: unknown[] = isBatchRequest
    ? (record.languages as unknown[])
    : [
        typeof record.targetLanguage === "string"
          ? record.targetLanguage
          : typeof record.targetLang === "string"
            ? record.targetLang
            : "",
      ]

  const seen = new Set<string>()
  const requestedLanguages: string[] = []

  for (const rawLanguage of rawLanguages) {
    if (typeof rawLanguage !== "string") continue
    const language = rawLanguage.trim().toLowerCase()
    if (!language || seen.has(language)) continue
    seen.add(language)
    requestedLanguages.push(language)
  }

  return { requestedLanguages, isBatchRequest }
}

async function queueTranslationTarget({
  supabase,
  bookId,
  sourceVersionId,
  sourceLanguage,
  targetLanguage,
  overwrite,
  requestedChapterId,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  bookId: string
  sourceVersionId: string
  sourceLanguage: string
  targetLanguage: string
  overwrite: boolean
  requestedChapterId: string | null
  userId: string
}): Promise<TranslationStartSuccess | TranslationStartFailure> {
  if (!isSupportedLanguage(targetLanguage)) {
    return {
      ok: false,
      targetLanguage,
      error: E_INVALID_TARGET_LANGUAGE,
      status: 400,
    }
  }

  if (sourceLanguage === targetLanguage) {
    return {
      ok: false,
      targetLanguage,
      error: E_SAME_SOURCE_TARGET_LANGUAGE,
      status: 400,
    }
  }

  if (!isTranslationPairSupported(sourceLanguage, targetLanguage)) {
    return {
      ok: false,
      targetLanguage,
      error: E_TRANSLATION_PAIR_UNSUPPORTED,
      status: 422,
      extra: {
        detail: `${sourceLanguage} -> ${targetLanguage}`,
      },
    }
  }

  const { data: existingVersion, error: existingVersionError } = await supabase
    .from("book_versions")
    .select("id, status")
    .eq("book_id", bookId)
    .eq("language_code", targetLanguage)
    .maybeSingle()

  if (existingVersionError) {
    console.error("[book translate] existing target version lookup failed", {
      bookId,
      targetLanguage,
      userId,
      message: existingVersionError.message,
    })
    return {
      ok: false,
      targetLanguage,
      error: E_DATABASE_ERROR,
      status: 500,
    }
  }

  if (existingVersion && !overwrite && !requestedChapterId) {
    return {
      ok: false,
      targetLanguage,
      error: E_VERSION_ALREADY_EXISTS,
      status: 400,
      extra: {
        detail: targetLanguage,
        existingVersionId: existingVersion.id,
      },
    }
  }

  if (!requestedChapterId) {
    try {
      await upsertBookTranslationState(supabase, {
        bookId,
        language: targetLanguage,
        status: "queued",
        progress: 0,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[book translate] failed to upsert queued translation state", {
        bookId,
        targetLanguage,
        userId,
        message,
      })
      return {
        ok: false,
        targetLanguage,
        error: E_DATABASE_ERROR,
        status: 500,
      }
    }
  }

  const targetVersionId = typeof existingVersion?.id === "string" ? existingVersion.id : null
  const jobId = await enqueueTranslationJob({
    bookId,
    sourceLanguage,
    sourceVersionId,
    targetLanguage,
    targetVersionId,
    overwrite,
    authorId: userId,
    chapterId: requestedChapterId,
  })

  if (!jobId) {
    if (!requestedChapterId) {
      try {
        await deleteBookTranslationState(supabase, bookId, targetLanguage)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[book translate] failed to clean queued translation state", {
          bookId,
          targetLanguage,
          userId,
          message,
        })
      }
    }

    return {
      ok: false,
      targetLanguage,
      error: E_TRANSLATION_SERVICE_UNAVAILABLE,
      status: 503,
    }
  }

  return {
    ok: true,
    targetLanguage,
    jobId,
    targetVersionId,
    chapterId: requestedChapterId,
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv()

  if (!isTranslationsEnabled()) {
    return apiError(E_TRANSLATION_FEATURE_DISABLED, 403)
  }

  const body = await request.json().catch(() => ({}))
  const { requestedLanguages, isBatchRequest } = parseRequestedLanguages(body)
  const requestedChapterId =
    body?.chapterId != null && String(body.chapterId).trim() !== ""
      ? String(body.chapterId).trim()
      : null
  const overwrite = Boolean(body?.overwrite)
  const bodySourceVersionId =
    body?.sourceVersionId != null && String(body.sourceVersionId).trim() !== ""
      ? String(body.sourceVersionId).trim()
      : null

  if (requestedLanguages.length === 0) {
    return apiError(E_INVALID_REQUEST_BODY, 400, {
      detail: "languages or targetLanguage is required",
    })
  }

  if (requestedChapterId && requestedLanguages.length !== 1) {
    return apiError(E_INVALID_REQUEST_BODY, 400, {
      detail: "chapter translation supports exactly one target language",
    })
  }

  const { id: bookId } = await params
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400)

  const { user, response } = await requireAuthorRoleForApi()
  if (response) return response

  const rl = await translateLimiter.check(user.id)
  if (!rl.allowed) return apiError(E_RATE_LIMIT_EXCEEDED, 429, { retryAfterSeconds: rl.retryAfterSeconds })

  // Allow bypassing Pro check if a valid paid Stripe session is provided
  const stripeSessionId =
    body?.stripeSessionId != null && String(body.stripeSessionId).trim() !== ""
      ? String(body.stripeSessionId).trim()
      : null

  let paidViaStripe = false
  if (stripeSessionId) {
    try {
      const session = await getStripeCheckoutSession(stripeSessionId)
      const meta = (session.metadata ?? {}) as Record<string, string>
      if (
        session.payment_status === "paid" &&
        meta.payment_kind === "translation" &&
        meta.user_id === user.id &&
        meta.book_id === bookId
      ) {
        paidViaStripe = true
      }
    } catch (error) {
      console.warn("[book translate] stripe session verification failed", {
        stripeSessionId,
        userId: user.id,
        bookId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (!paidViaStripe) {
    const proGate = await requireProBillingForApi(user.id)
    if (!proGate.ok) return proGate.response
  }

  const supabase = await createClient()
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id, original_language, language")
    .eq("id", bookId)
    .maybeSingle()

  if (bookError || !book) {
    if (bookError) {
      console.error("[book translate] book fetch failed", {
        bookId,
        userId: user.id,
        message: bookError.message,
      })
    }
    return apiError(E_BOOK_NOT_FOUND, 404)
  }

  if (book.author_id !== user.id) {
    return apiError(E_FORBIDDEN, 403)
  }

  const sourceContext = await resolveTranslationSourceContext({
    supabase,
    bookId,
    book,
    requestedSourceVersionId: bodySourceVersionId,
  })

  if (!sourceContext.sourceVersionId) {
    return apiError(E_NO_SOURCE_VERSION, 400)
  }

  if (!sourceContext.sourceVersion) {
    return apiError(E_INVALID_SOURCE_VERSION, 400)
  }

  if (requestedChapterId) {
    const { data: sourceChapter, error: sourceChapterError } = await supabase
      .from("chapters")
      .select("id")
      .eq("book_version_id", sourceContext.sourceVersion.id)
      .eq("id", requestedChapterId)
      .maybeSingle()

    if (sourceChapterError) {
      console.error("[book translate] source chapter lookup failed", {
        bookId,
        sourceVersionId: sourceContext.sourceVersion.id,
        chapterId: requestedChapterId,
        userId: user.id,
        message: sourceChapterError.message,
      })
      return apiError(E_INVALID_SOURCE_VERSION, 400)
    }

    if (!sourceChapter) {
      return apiError(E_INVALID_SOURCE_VERSION, 400, {
        detail: `chapterId ${requestedChapterId} not found for source version`,
      })
    }
  }

  console.info("[book translate] request", {
    bookId,
    sourceVersionId: sourceContext.sourceVersion.id,
    sourceLanguage: sourceContext.sourceLanguage ?? null,
    sourceLanguageOrigin: sourceContext.sourceLanguageOrigin,
    requestedLanguages,
    chapterId: requestedChapterId,
    userId: user.id,
    overwrite,
  })

  if (!sourceContext.sourceLanguage) {
    console.warn("[book translate] source language missing", {
      bookId,
      sourceVersionId: sourceContext.sourceVersion.id,
      requestedLanguages,
      chapterId: requestedChapterId,
      userId: user.id,
    })
    return apiError(E_SOURCE_LANGUAGE_MISSING, 422)
  }

  if (!isBatchRequest) {
    const result = await queueTranslationTarget({
      supabase,
      bookId,
      sourceVersionId: sourceContext.sourceVersion.id,
      sourceLanguage: sourceContext.sourceLanguage,
      targetLanguage: requestedLanguages[0],
      overwrite,
      requestedChapterId,
      userId: user.id,
    })

    if (!result.ok) {
      return apiError(result.error, result.status, result.extra)
    }

    return NextResponse.json({
      ok: true,
      jobId: result.jobId,
      targetVersionId: result.targetVersionId,
      chapterId: result.chapterId,
    })
  }

  const jobs: Array<{
    language: string
    jobId: string
    targetVersionId: string | null
  }> = []
  const rejected: Array<{
    language: string
    error: string
    detail?: string
    existingVersionId?: string
  }> = []

  for (const targetLanguage of requestedLanguages) {
    const result = await queueTranslationTarget({
      supabase,
      bookId,
      sourceVersionId: sourceContext.sourceVersion.id,
      sourceLanguage: sourceContext.sourceLanguage,
      targetLanguage,
      overwrite,
      requestedChapterId,
      userId: user.id,
    })

    if (result.ok) {
      jobs.push({
        language: result.targetLanguage,
        jobId: result.jobId,
        targetVersionId: result.targetVersionId,
      })
      continue
    }

    rejected.push({
      language: result.targetLanguage,
      error: result.error,
      detail: typeof result.extra?.detail === "string" ? result.extra.detail : undefined,
      existingVersionId:
        typeof result.extra?.existingVersionId === "string" ? result.extra.existingVersionId : undefined,
    })
  }

  if (jobs.length === 0) {
    const firstRejected = rejected[0]
    return apiError(firstRejected?.error ?? E_INVALID_REQUEST_BODY, firstRejected ? (firstRejected.error === E_TRANSLATION_SERVICE_UNAVAILABLE ? 503 : 400) : 400, {
      rejected,
    })
  }

  return NextResponse.json({
    ok: true,
    sourceVersionId: sourceContext.sourceVersion.id,
    jobs,
    rejected,
  })
}
