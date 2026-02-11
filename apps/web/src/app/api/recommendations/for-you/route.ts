import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, E_NOT_AUTHENTICATED } from "@/lib/api-errors";
import { scoreSimilarBooks, type ScoredBook } from "@/lib/recommendations/scoring";
import { enrichWithAuthors } from "@/lib/recommendations/enrichment";
import { normalizeLanguageOrNull } from "@/lib/languages";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;
const MAX_HISTORY_SEEDS = 5;
const PER_SEED_LIMIT = 50;

type SeedBook = {
  id: string;
  author_id: string;
  language: string | null;
  genreIds: string[];
};

function parseLimit(requestUrl: string): number {
  const url = new URL(requestUrl);
  const raw = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  if (!Number.isFinite(raw)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(raw)));
}

function makeUnique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0))];
}

function aggregateScoredBooks(
  batches: ScoredBook[][],
  excludedBookIds: Set<string>,
  limit: number
): ScoredBook[] {
  const merged = new Map<string, ScoredBook>();

  for (const batch of batches) {
    for (const scored of batch) {
      if (excludedBookIds.has(scored.id)) continue;
      const existing = merged.get(scored.id);
      if (existing) {
        merged.set(scored.id, { ...existing, score: existing.score + scored.score });
      } else {
        merged.set(scored.id, { ...scored });
      }
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const limit = parseLimit(request.url);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const [readingsRes, genrePrefRes] = await Promise.all([
    supabase.from("readings").select("book_id").eq("user_id", user.id).limit(50),
    supabase.from("reader_genre_preferences").select("genre_id").eq("user_id", user.id).limit(30),
  ]);

  const historyBookIds = makeUnique((readingsRes.data ?? []).map((r) => r.book_id));
  const preferredGenreIds = makeUnique((genrePrefRes.data ?? []).map((r) => r.genre_id));

  const historySeedIds = historyBookIds.slice(0, MAX_HISTORY_SEEDS);
  let seeds: SeedBook[] = [];

  if (historySeedIds.length > 0) {
    const [{ data: historyBooks }, { data: historyBookGenres }] = await Promise.all([
      supabase
        .from("books")
        .select("id, author_id, language")
        .in("id", historySeedIds),
      supabase
        .from("book_genres")
        .select("book_id, genre_id")
        .in("book_id", historySeedIds),
    ]);

    const genreMap = new Map<string, string[]>();
    for (const row of historyBookGenres ?? []) {
      const current = genreMap.get(row.book_id) ?? [];
      current.push(row.genre_id);
      genreMap.set(row.book_id, current);
    }

    seeds = (historyBooks ?? []).map((book) => ({
      id: book.id,
      author_id: book.author_id,
      language: normalizeLanguageOrNull(book.language),
      genreIds: makeUnique([...(genreMap.get(book.id) ?? []), ...preferredGenreIds]),
    }));
  }

  if (seeds.length === 0 && preferredGenreIds.length > 0) {
    const { data: fallbackGenreRows } = await supabase
      .from("book_genres")
      .select("book_id")
      .in("genre_id", preferredGenreIds)
      .limit(25);

    const fallbackBookIds = makeUnique((fallbackGenreRows ?? []).map((r) => r.book_id)).slice(0, MAX_HISTORY_SEEDS);
    if (fallbackBookIds.length > 0) {
      const { data: fallbackBooks } = await supabase
        .from("books")
        .select("id, author_id, language")
        .eq("status", "PUBLISHED")
        .in("id", fallbackBookIds);

      seeds = (fallbackBooks ?? []).map((book) => ({
        id: book.id,
        author_id: book.author_id,
        language: normalizeLanguageOrNull(book.language),
        genreIds: preferredGenreIds,
      }));
    }
  }

  if (seeds.length === 0) {
    return NextResponse.json({
      books: [],
      meta: {
        seedCount: 0,
        historyBookCount: historyBookIds.length,
        preferredGenreCount: preferredGenreIds.length,
      },
    });
  }

  const scoredBatches = await Promise.all(
    seeds.map((seed) =>
      scoreSimilarBooks(
        supabase,
        seed.id,
        seed.author_id,
        seed.language,
        seed.genreIds,
        PER_SEED_LIMIT
      )
    )
  );

  const excluded = new Set<string>(historyBookIds);
  const topScored = aggregateScoredBooks(scoredBatches, excluded, limit);
  const books = await enrichWithAuthors(supabase, topScored);

  return NextResponse.json({
    books,
    meta: {
      seedCount: seeds.length,
      historyBookCount: historyBookIds.length,
      preferredGenreCount: preferredGenreIds.length,
    },
  });
}
