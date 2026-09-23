import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeLanguageOrNull } from "@/lib/languages";
import {
  getBookAsOwner,
  getBookVersions,
  countChaptersForVersion,
} from "@/lib/books/service";
import { apiError, E_BOOK_NOT_FOUND, E_FORBIDDEN, E_INVALID_BOOK_ID, isValidUuid } from "@/lib/api-errors";

/**
 * GET /api/books/[id]/translation-progress?targetLanguage=en
 * Returns { translated, total } for the current translation run.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);
  const { searchParams } = new URL(request.url);
  const targetLanguage = normalizeLanguageOrNull(searchParams.get("targetLanguage") ?? "");

  if (!targetLanguage) {
    return NextResponse.json({ ok: true, data: { translated: 0, total: 0 } });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: true, data: { translated: 0, total: 0 } });
  }

  // Ownership check
  const bookResult = await getBookAsOwner(
    supabase,
    bookId,
    user.id,
    "id, author_id, original_language, language",
  );
  if (!bookResult.ok) {
    if (bookResult.error === "book_not_found") return apiError(E_BOOK_NOT_FOUND, 404);
    return apiError(E_FORBIDDEN, 403);
  }

  const book = bookResult.data as { id: string; author_id: string; original_language?: string | null; language?: string | null };

  const preferredSourceLang =
    normalizeLanguageOrNull(book.original_language) ??
    normalizeLanguageOrNull(book.language);

  // Fetch versions via service
  const versionsResult = await getBookVersions(supabase, bookId, {
    select: "id, language_code",
  });
  const versions = versionsResult.ok ? versionsResult.data : [];

  type VersionSlim = { id: string; language_code: string | null };
  const versionRows = versions as unknown as VersionSlim[];

  const sourceVersion = preferredSourceLang
    ? versionRows.find((v) => normalizeLanguageOrNull(v.language_code) === preferredSourceLang)
    : null;
  const sourceVersionId = sourceVersion?.id ?? versionRows[0]?.id ?? null;
  const targetVersion = versionRows.find((v) => normalizeLanguageOrNull(v.language_code) === targetLanguage);
  const targetVersionId = targetVersion?.id ?? null;

  let total = 0;
  let translated = 0;

  if (sourceVersionId) {
    const countResult = await countChaptersForVersion(supabase, sourceVersionId);
    if (countResult.ok) total = countResult.data;
  }

  if (targetVersionId) {
    const countResult = await countChaptersForVersion(supabase, targetVersionId);
    if (countResult.ok) translated = countResult.data;
  }

  // Response
  return NextResponse.json({ ok: true, data: { translated, total } });
}
