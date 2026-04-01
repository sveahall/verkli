import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuthorRoleForApi } from "@/lib/auth/require-author"
import { apiError, isValidUuid, E_BOOK_NOT_FOUND, E_DATABASE_ERROR, E_INVALID_BOOK_ID } from "@/lib/api-errors"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400)

  const { user, response } = await requireAuthorRoleForApi()
  if (response) return response

  const supabase = await createClient()
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle()

  if (bookError) {
    console.error("[book translations] failed to load book", {
      bookId,
      userId: user.id,
      message: bookError.message,
    })
    return apiError(E_DATABASE_ERROR, 500)
  }

  if (!book || book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404)
  }

  const { data: rows, error: translationsError } = await supabase
    .from("book_translations")
    .select("id, language, status, progress, created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })

  if (translationsError) {
    console.error("[book translations] failed to load translations", {
      bookId,
      userId: user.id,
      message: translationsError.message,
    })
    return apiError(E_DATABASE_ERROR, 500)
  }

  return NextResponse.json({
    bookId,
    translations: (rows ?? []).map((row) => ({
      id: row.id,
      language: row.language,
      status: row.status,
      progress: row.progress,
      created_at: row.created_at,
    })),
  })
}
