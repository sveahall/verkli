import { NextResponse } from "next/server"
import { getTranslatorForPair } from "@/lib/ai/providers/server"
import { AIProviderError } from "@/lib/ai/providers/types"
import { requireAuthorRoleForApi } from "@/lib/auth/require-author"
import { assertPublicEnv } from "@/lib/env"
import {
  collectTranslationPreviewText,
  resolveTranslationSourceContext,
} from "@/lib/book-translation"
import { createClient } from "@/lib/supabase/server"
import { isSupportedLanguage } from "@/lib/languages"
import { isTranslationPairSupported, getProviderForPair } from "@/lib/translation-pairs"
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_FORBIDDEN,
  E_INVALID_TARGET_LANGUAGE,
  E_INVALID_SOURCE_VERSION,
  E_NO_SOURCE_VERSION,
  E_SAME_SOURCE_TARGET_LANGUAGE,
  E_SOURCE_LANGUAGE_MISSING,
  E_TRANSLATION_SERVICE_UNAVAILABLE,
  isValidUuid,
} from "@/lib/api-errors"

function previewServiceError(originalText = "") {
  return NextResponse.json(
    {
      error: E_TRANSLATION_SERVICE_UNAVAILABLE,
      originalText,
      translatedText: "",
      previewText: "",
      previewUnavailable: true,
    },
    { status: 503 }
  )
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv()

  const { user, response } = await requireAuthorRoleForApi()
  if (response) return response

  const { id: bookId } = await params
  const searchParams = new URL(request.url).searchParams
  const targetLanguage = searchParams.get("targetLanguage")?.trim().toLowerCase() ?? ""
  const hasRequestedSourceVersion = searchParams.has("sourceVersionId")
  const requestedSourceVersionId = searchParams.get("sourceVersionId")?.trim() ?? null

  if (!targetLanguage || !isSupportedLanguage(targetLanguage)) {
    return apiError(E_INVALID_TARGET_LANGUAGE, 400)
  }

  const supabase = await createClient()
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id, original_language, language")
    .eq("id", bookId)
    .maybeSingle()

  if (bookError || !book) {
    if (bookError) {
      console.error("[book translation preview] book fetch failed", {
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

  if (
    hasRequestedSourceVersion &&
    (!requestedSourceVersionId || !isValidUuid(requestedSourceVersionId))
  ) {
    return apiError(E_INVALID_SOURCE_VERSION, 400)
  }

  let sourceContext
  try {
    sourceContext = await resolveTranslationSourceContext({
      supabase,
      bookId,
      book,
      requestedSourceVersionId,
    })
  } catch {
    console.error("[book translation preview] source version lookup failed", {
      bookId,
      requestedSourceVersionId,
      targetLanguage,
      userId: user.id,
      code: E_TRANSLATION_SERVICE_UNAVAILABLE,
    })
    return previewServiceError()
  }

  if (!sourceContext.sourceVersionId) {
    return apiError(E_NO_SOURCE_VERSION, 400)
  }

  if (!sourceContext.sourceVersion) {
    return apiError(E_INVALID_SOURCE_VERSION, 400)
  }

  if (!sourceContext.sourceLanguage) {
    console.warn("[book translation preview] source language missing", {
      bookId,
      sourceVersionId: sourceContext.sourceVersionId,
      targetLanguage,
      userId: user.id,
    })
    return apiError(E_SOURCE_LANGUAGE_MISSING, 422)
  }

  if (sourceContext.sourceLanguage === targetLanguage) {
    return apiError(E_SAME_SOURCE_TARGET_LANGUAGE, 400)
  }

  // Always collect source text so the "Original text" panel is populated
  // even when the translation pair is unsupported.
  // Use shorter preview for API-based translation (Riva 8K context limit).
  const previewWordLimit = getProviderForPair(sourceContext.sourceLanguage, targetLanguage) === "opus" ? 1000 : 300
  let originalText = ""
  try {
    originalText = await collectTranslationPreviewText(supabase, sourceContext.sourceVersionId, previewWordLimit)
  } catch {
    console.error("[book translation preview] failed to collect preview text", {
      bookId,
      sourceVersionId: sourceContext.sourceVersionId,
      targetLanguage,
      userId: user.id,
      code: E_TRANSLATION_SERVICE_UNAVAILABLE,
    })
    return previewServiceError()
  }

  if (!originalText.trim()) {
    return NextResponse.json({
      originalText: "",
      translatedText: "",
      previewText: "",
    })
  }

  if (!isTranslationPairSupported(sourceContext.sourceLanguage, targetLanguage)) {
    return NextResponse.json({
      originalText,
      translatedText: "",
      previewText: "",
      pairUnsupported: true,
    })
  }

  try {
    const translator = getTranslatorForPair(sourceContext.sourceLanguage, targetLanguage)
    if (!translator) {
      console.error("[book translation preview] provider registry missing", {
        bookId,
        sourceVersionId: sourceContext.sourceVersionId,
        sourceLanguage: sourceContext.sourceLanguage,
        targetLanguage,
        userId: user.id,
        code: E_TRANSLATION_SERVICE_UNAVAILABLE,
      })
      return previewServiceError(originalText)
    }
    const result = await translator.translate({
      text: originalText,
      sourceLanguage: sourceContext.sourceLanguage,
      targetLanguage,
    })

    if (!result || typeof result.translatedText !== "string" || !result.translatedText.trim()) {
      throw new AIProviderError(
        "Translation provider returned an invalid preview.",
        "MODEL_ERROR",
        translator.name
      )
    }

    return NextResponse.json({
      originalText,
      translatedText: result.translatedText,
      previewText: result.translatedText,
    })
  } catch (error) {
    console.error("[book translation preview] translation model failed", {
      bookId,
      sourceVersionId: sourceContext.sourceVersionId,
      sourceLanguage: sourceContext.sourceLanguage,
      targetLanguage,
      userId: user.id,
      provider: error instanceof AIProviderError ? error.provider : "unknown",
      code: error instanceof AIProviderError ? error.code : E_TRANSLATION_SERVICE_UNAVAILABLE,
    })
    return previewServiceError(originalText)
  }
}
