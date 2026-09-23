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

  // Validation — hard caps on user-controlled strings so a bad client can't
  // insert 1 MB titles or descriptions into the DB.
  const MAX_TITLE_LEN = 200;
  const MAX_DESCRIPTION_LEN = 4000;
  const MAX_URL_LEN = 2048;
  const body = await request.json().catch(() => ({}));
  const rawTitle = String(body?.title ?? "Untitled").trim();
  const title = (rawTitle || "Untitled").slice(0, MAX_TITLE_LEN);
  const description =
    body?.description != null
      ? (String(body.description).trim() || "").slice(0, MAX_DESCRIPTION_LEN) || null
      : null;
  const language = normalizeLanguage(body?.language);
  const original_source =
    body?.original_source != null
      ? (String(body.original_source).trim() || "").slice(0, 100) || null
      : null;
  const original_url =
    body?.original_url != null
      ? (String(body.original_url).trim() || "").slice(0, MAX_URL_LEN) || null
      : null;

  // Add a short random suffix so two rapid POSTs with the same title in the
  // same millisecond don't collide on `slug` (unique constraint).
  const slugSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    slugSuffix;

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
