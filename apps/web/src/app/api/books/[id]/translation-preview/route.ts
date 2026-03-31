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
  E_NO_SOURCE_VERSION,
  E_SAME_SOURCE_TARGET_LANGUAGE,
  E_SOURCE_LANGUAGE_MISSING,
  E_TRANSLATION_SERVICE_UNAVAILABLE,
} from "@/lib/api-errors"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv()

  const { user, response } = await requireAuthorRoleForApi()
  if (response) return response

  const { id: bookId } = await params
  const targetLanguage = new URL(request.url).searchParams.get("targetLanguage")?.trim().toLowerCase() ?? ""

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

  const sourceContext = await resolveTranslationSourceContext({
    supabase,
    bookId,
    book,
  })

  if (!sourceContext.sourceVersionId) {
    return apiError(E_NO_SOURCE_VERSION, 400)
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[book translation preview] failed to collect preview text", {
      bookId,
      sourceVersionId: sourceContext.sourceVersionId,
      targetLanguage,
      userId: user.id,
      message,
    })
    return apiError(E_TRANSLATION_SERVICE_UNAVAILABLE, 503)
  }

  if (!isTranslationPairSupported(sourceContext.sourceLanguage, targetLanguage)) {
    return NextResponse.json({
      originalText,
      translatedText: "",
      previewText: "",
      pairUnsupported: true,
    })
  }

  if (!originalText) {
    return NextResponse.json({
      originalText: "",
      translatedText: "",
      previewText: "",
    })
  }

  try {
    const translator = getTranslatorForPair(sourceContext.sourceLanguage, targetLanguage)
    if (!translator) {
      return NextResponse.json({
        originalText,
        translatedText: "",
        previewText: "",
        pairUnsupported: true,
      })
    }
    const result = await translator.translate({
      text: originalText,
      sourceLanguage: sourceContext.sourceLanguage,
      targetLanguage,
    })

    return NextResponse.json({
      originalText,
      translatedText: result.translatedText,
      previewText: result.translatedText,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (error instanceof AIProviderError && error.code === "PROVIDER_UNAVAILABLE") {
      console.warn("[book translation preview] local preview unavailable", {
        bookId,
        sourceVersionId: sourceContext.sourceVersionId,
        sourceLanguage: sourceContext.sourceLanguage,
        targetLanguage,
        userId: user.id,
        provider: error.provider,
        code: error.code,
        message,
      })

      return NextResponse.json({
        originalText,
        translatedText: "",
        previewText: "",
        previewUnavailable: true,
      })
    }

    console.error("[book translation preview] translation model failed", {
      bookId,
      sourceVersionId: sourceContext.sourceVersionId,
      sourceLanguage: sourceContext.sourceLanguage,
      targetLanguage,
      userId: user.id,
      message,
    })
    return apiError(E_TRANSLATION_SERVICE_UNAVAILABLE, 503)
  }
}
