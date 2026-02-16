import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeLanguageOrNull } from "@/lib/languages";
import { apiError, E_BOOK_NOT_FOUND, E_FORBIDDEN } from "@/lib/api-errors";

/**
 * GET /api/books/[id]/translation-progress?targetLanguage=en
 * Returns { translated, total } for the current translation run.
 * Used to show progress bar: translated = chapters in target version, total = chapters in source version.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;
  const { searchParams } = new URL(request.url);
  const targetLanguage = normalizeLanguageOrNull(searchParams.get("targetLanguage") ?? "");

  if (!targetLanguage) {
    return NextResponse.json({ translated: 0, total: 0 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ translated: 0, total: 0 });
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id, original_language, language")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError || !book) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  if (book.author_id !== user.id) {
    return apiError(E_FORBIDDEN, 403);
  }

  const preferredSourceLang =
    normalizeLanguageOrNull((book as { original_language?: string | null }).original_language) ??
    normalizeLanguageOrNull((book as { language?: string | null }).language);

  const { data: versions } = await supabase
    .from("book_versions")
    .select("id, language_code")
    .eq("book_id", bookId);

  const sourceVersion = preferredSourceLang
    ? versions?.find((v) => normalizeLanguageOrNull(v.language_code) === preferredSourceLang)
    : null;
  const sourceVersionId = sourceVersion?.id ?? versions?.[0]?.id ?? null;
  const targetVersion = versions?.find((v) => normalizeLanguageOrNull(v.language_code) === targetLanguage);
  const targetVersionId = targetVersion?.id ?? null;

  let total = 0;
  let translated = 0;

  if (sourceVersionId) {
    const { count } = await supabase
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("book_version_id", sourceVersionId);
    total = count ?? 0;
  }

  if (targetVersionId) {
    const { count } = await supabase
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("book_version_id", targetVersionId);
    translated = count ?? 0;
  }

  return NextResponse.json({ translated, total });
}
