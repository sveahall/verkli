import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_DATABASE_ERROR,
  E_RATE_LIMIT_EXCEEDED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import {
  PUBLIC_BOOK_COLUMNS,
  toPublicBookSummary,
  type AuthorRow,
  type BookRow,
} from "@/lib/api/public-book";
import { getClientIp, publicApiRateLimiter } from "../_shared";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().min(1).max(120).optional(),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2}(-[a-z0-9]+)?$/i)
    .optional(),
  is_free: z.enum(["true", "false"]).optional(),
});

export async function GET(request: Request) {
  const limit = await publicApiRateLimiter.check(getClientIp(request));
  if (!limit.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    language: url.searchParams.get("language") ?? undefined,
    is_free: url.searchParams.get("is_free") ?? undefined,
  });
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }
  const { page, limit: pageSize, q, language, is_free } = parsed.data;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = createAdminClient();
  let query = supabase
    .from("books")
    .select(PUBLIC_BOOK_COLUMNS, { count: "exact" })
    .eq("status", "PUBLISHED")
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (q) {
    query = query.ilike("title", `%${q}%`);
  }
  if (language) {
    query = query.eq("language", language);
  }
  if (is_free === "true") {
    query = query.eq("is_free", true);
  } else if (is_free === "false") {
    query = query.eq("is_free", false);
  }

  const { data: rows, count, error } = await query;
  if (error) {
    return apiError(E_DATABASE_ERROR, 500);
  }
  const books = (rows ?? []) as unknown as BookRow[];

  const authorIds = Array.from(new Set(books.map((b) => b.author_id)));
  let authors: AuthorRow[] = [];
  if (authorIds.length > 0) {
    const { data: authorRows } = await supabase
      .from("profiles")
      .select("user_id, display_name, username")
      .in("user_id", authorIds);
    authors = (authorRows ?? []) as unknown as AuthorRow[];
  }
  const authorMap = new Map<string, AuthorRow>(authors.map((a) => [a.user_id, a]));

  const items = books.map((b) => toPublicBookSummary(b, authorMap.get(b.author_id)));

  return NextResponse.json({
    items,
    total: count ?? items.length,
    page,
    limit: pageSize,
  });
}
