import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { normalizeLanguage } from "@/lib/languages";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createBook } from "@/lib/books/service";
import {
  apiError,
  E_DATABASE_ERROR,
  E_BOOK_CREATION_INCOMPLETE,
  E_VERSION_CREATION_FAILED,
  E_DEFAULT_CHAPTER_CREATION_FAILED,
} from "@/lib/api-errors";

const CREATE_ERROR_MAP: Record<string, [string, number]> = {
  database_error: [E_DATABASE_ERROR, 500],
  book_creation_incomplete: [E_BOOK_CREATION_INCOMPLETE, 500],
  version_creation_failed: [E_VERSION_CREATION_FAILED, 500],
  default_chapter_creation_failed: [E_DEFAULT_CHAPTER_CREATION_FAILED, 500],
};

export async function POST(request: Request) {
  assertPublicEnv();

  // Auth
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  // Validation
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? "Untitled").trim() || "Untitled";
  const description = body?.description != null ? String(body.description).trim() || null : null;
  const language = normalizeLanguage(body?.language);
  const original_source = body?.original_source != null ? String(body.original_source).trim() || null : null;
  const original_url = body?.original_url != null ? String(body.original_url).trim() || null : null;

  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    Date.now();

  // Service call
  const supabase = await createClient();
  const result = await createBook(supabase, {
    authorId: user.id,
    title,
    description,
    slug,
    language,
    originalSource: original_source,
    originalUrl: original_url,
  });

  if (!result.ok) {
    const [key, status] = CREATE_ERROR_MAP[result.error] ?? [E_DATABASE_ERROR, 500];
    return apiError(key, status);
  }

  // Response
  return NextResponse.json({ ok: true, data: { id: result.data.bookId, versionId: result.data.versionId } });
}
