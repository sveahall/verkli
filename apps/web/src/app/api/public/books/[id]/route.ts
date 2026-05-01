import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_RATE_LIMIT_EXCEEDED,
  isValidUuid,
} from "@/lib/api-errors";
import {
  PUBLIC_BOOK_COLUMNS,
  toPublicBookDetail,
  type AuthorRow,
  type BookRow,
  type GenreRow,
  type VersionRow,
} from "@/lib/api/public-book";
import { getClientIp, publicApiRateLimiter } from "../../_shared";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,150}[a-z0-9])?$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limit = await publicApiRateLimiter.check(getClientIp(request));
  if (!limit.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id: param } = await params;
  const isUuid = isValidUuid(param);
  if (!isUuid && !SLUG_RE.test(param)) {
    return apiError(E_INVALID_BOOK_ID, 400);
  }

  const supabase = createAdminClient();
  const lookupColumn = isUuid ? "id" : "slug";
  const { data: bookRow, error } = await supabase
    .from("books")
    .select(PUBLIC_BOOK_COLUMNS)
    .eq(lookupColumn, param)
    .eq("status", "PUBLISHED")
    .maybeSingle();
  if (error) return apiError(E_DATABASE_ERROR, 500);
  if (!bookRow) return apiError(E_BOOK_NOT_FOUND, 404);
  const book = bookRow as unknown as BookRow;

  const [authorRes, genreRes, versionRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, display_name, username")
      .eq("user_id", book.author_id)
      .maybeSingle(),
    supabase
      .from("book_genres")
      .select("genres(name, name_en)")
      .eq("book_id", book.id),
    supabase
      .from("book_versions")
      .select("language_code, published_at")
      .eq("book_id", book.id),
  ]);

  const author = (authorRes.data ?? null) as AuthorRow | null;
  const genres: GenreRow[] = ((genreRes.data ?? []) as unknown as Array<{ genres: GenreRow | GenreRow[] | null }>)
    .flatMap((row) => {
      if (!row.genres) return [];
      return Array.isArray(row.genres) ? row.genres : [row.genres];
    });
  const versions = (versionRes.data ?? []) as unknown as VersionRow[];

  return NextResponse.json(toPublicBookDetail(book, author, genres, versions));
}
