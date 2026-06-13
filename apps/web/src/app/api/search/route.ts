import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_VALIDATION_FAILED,
  E_GENERIC_ERROR,
} from "@/lib/api-errors";
import { isSupportedLanguage } from "@/lib/languages";
import { getAuthorProStatusSet } from "@/lib/billing/pro-status";

// Global search (Phase 0.5).
//
// `GET /api/search?q=...&type=book|author|all&language=en&limit=20`
//
// Uses the `search_vector` GENERATED columns added in
// 20260429150000_search_fts.sql + GIN indexes for sub-100ms p50 lookup at
// reasonable scale. `plainto_tsquery('simple', ...)` parses the user input
// safely (no injection risk).
//
// Response shape is intentionally flat so the topbar autocomplete can render
// without per-result-type branching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().min(1).max(200),
  type: z.enum(["book", "author", "all"]).optional().default("all"),
  language: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).optional().default(10),
});

type SearchHit =
  | {
      kind: "book";
      id: string;
      title: string;
      cover: string | null;
      authorId: string | null;
      language: string | null;
      score: number;
    }
  | {
      kind: "author";
      id: string;
      displayName: string | null;
      username: string | null;
      avatarUrl: string | null;
      isPro: boolean;
      score: number;
    };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    type: url.searchParams.get("type") ?? undefined,
    language: url.searchParams.get("language") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return apiError(E_VALIDATION_FAILED, 400);

  const { q, type, limit } = parsed.data;
  const language = parsed.data.language && isSupportedLanguage(parsed.data.language)
    ? parsed.data.language
    : null;

  const supabase = await createClient();
  const hits: SearchHit[] = [];

  try {
    if (type === "book" || type === "all") {
      let booksQuery = supabase
        .from("books")
        .select(
          "id, title, cover_image, author_id, language, status, search_vector"
        )
        .eq("status", "PUBLISHED")
        // textSearch uses the configured operator; 'simple' matches the
        // GENERATED tsvector config in 20260429150000_search_fts.sql.
        .textSearch("search_vector", q, { type: "plain", config: "simple" })
        .limit(limit);

      if (language) booksQuery = booksQuery.eq("language", language);

      const { data, error } = await booksQuery;
      if (error) throw new Error(`books search failed: ${error.message}`);

      for (const row of (data ?? []) as Array<{
        id: string;
        title: string;
        cover_image: string | null;
        author_id: string | null;
        language: string | null;
      }>) {
        hits.push({
          kind: "book",
          id: row.id,
          title: row.title,
          cover: row.cover_image,
          authorId: row.author_id,
          language: row.language,
          // Real ranking is server-side via ts_rank_cd. Without a custom
          // RPC we can't surface the float here; clients sort by recency
          // within each kind and rely on Postgres' default ordering for
          // textSearch which approximates rank.
          score: 0,
        });
      }
    }

    if (type === "author" || type === "all") {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, avatar_url, is_public")
        .eq("is_public", true)
        .textSearch("search_vector", q, { type: "plain", config: "simple" })
        .limit(limit);
      if (error) throw new Error(`profiles search failed: ${error.message}`);

      const rows = (data ?? []) as Array<{
        user_id: string;
        display_name: string | null;
        username: string | null;
        avatar_url: string | null;
      }>;
      // Batched PRO-status for the matched authors (one round-trip, no N+1).
      const proSet = await getAuthorProStatusSet(rows.map((r) => r.user_id));
      for (const row of rows) {
        hits.push({
          kind: "author",
          id: row.user_id,
          displayName: row.display_name,
          username: row.username,
          avatarUrl: row.avatar_url,
          isPro: proSet.has(row.user_id),
          score: 0,
        });
      }
    }
  } catch (err) {
    console.error("[search] failed", {
      q,
      type,
      message: err instanceof Error ? err.message : String(err),
    });
    return apiError(E_GENERIC_ERROR, 500);
  }

  return NextResponse.json({
    q,
    type,
    language,
    hits: hits.slice(0, limit),
    total: hits.length,
  });
}
