import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { normalizeLanguageOrNull } from "@/lib/languages";
import { apiError, E_BOOK_NOT_FOUND, E_DATABASE_ERROR } from "@/lib/api-errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id, original_language, language")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[books.translations] failed to load book", {
      bookId,
      userId: user.id,
      message: bookError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (!book || book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const { data: rows, error: versionsError } = await supabase
    .from("book_versions")
    .select("id, language_code, status, published_at, created_at, updated_at")
    .eq("book_id", bookId)
    .order("updated_at", { ascending: false });

  if (versionsError) {
    console.error("[books.translations] failed to load versions", {
      bookId,
      userId: user.id,
      message: versionsError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const sourceLanguage =
    normalizeLanguageOrNull(book.original_language) ??
    normalizeLanguageOrNull(book.language);

  const translations = (rows ?? []).map((row) => {
    const versionLanguage = normalizeLanguageOrNull(row.language_code);
    const isOriginal = Boolean(sourceLanguage && versionLanguage === sourceLanguage);
    return {
      id: row.id,
      language_code: row.language_code,
      status: row.status,
      published_at: row.published_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_original: isOriginal,
    };
  });

  return NextResponse.json({ bookId, translations });
}
