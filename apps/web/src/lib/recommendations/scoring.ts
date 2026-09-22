import type { SupabaseClient } from "@supabase/supabase-js";

export interface ScoredBook {
  id: string;
  title: string;
  cover_image: string | null;
  author_id: string;
  score: number;
}

/**
 * Score and rank similar books based on genre overlap, same-author boost,
 * and language match. Returns up to `limit` books sorted by score DESC.
 */
export async function scoreSimilarBooks(
  supabase: SupabaseClient,
  bookId: string | null,
  authorId: string | null,
  language: string | null,
  genreIds: string[],
  limit: number
): Promise<ScoredBook[]> {
  // Filter for actual content signals before applying a bounded candidate window.
  // An arbitrary first 200 catalog rows can contain no matches at all.
  if (!authorId && genreIds.length === 0) return [];
  const candidateQuery = (byGenre: boolean) => {
    let query = byGenre
      ? supabase.from("books")
        .select("id, title, cover_image, author_id, language, book_genres!inner(genre_id)")
        .eq("status", "PUBLISHED")
      : supabase.from("books")
        .select("id, title, cover_image, author_id, language")
        .eq("status", "PUBLISHED");
    if (bookId) query = query.neq("id", bookId);
    return query.order("published_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true });
  };
  const results = await Promise.all([
    ...(genreIds.length > 0
      ? [candidateQuery(true).in("book_genres.genre_id", genreIds).limit(200)] : []),
    ...(authorId ? [candidateQuery(false).eq("author_id", authorId).limit(200)] : []),
  ]);
  const candidatesById = new Map<string, {
    id: string; title: string; cover_image: string | null; author_id: string; language: string | null;
  }>();
  for (const { data, error } of results) {
    if (error) {
      console.error("[recommendations] candidate lookup failed", error.message);
      throw new Error("Could not load recommendation candidates.");
    }
    for (const book of data ?? []) candidatesById.set(book.id, book);
  }
  const candidates = [...candidatesById.values()];
  if (!candidates.length) return [];

  // 2. Fetch genres for candidates
  const candidateIds = candidates.map((b) => b.id);
  const { data: candidateGenres, error: genresError } = await supabase
    .from("book_genres")
    .select("book_id, genre_id")
    .in("book_id", candidateIds);

  if (genresError) {
    console.error("[recommendations] genre lookup failed", genresError.message);
    throw new Error("Could not load recommendation genres.");
  }

  const bookGenreMap = new Map<string, Set<string>>();
  for (const bg of candidateGenres ?? []) {
    const set = bookGenreMap.get(bg.book_id) ?? new Set();
    set.add(bg.genre_id);
    bookGenreMap.set(bg.book_id, set);
  }

  const sourceGenres = new Set(genreIds);

  // 3. Score each candidate
  const scored: ScoredBook[] = [];

  for (const book of candidates) {
    let score = 0;

    // Genre overlap: +10 per shared genre
    const genres = bookGenreMap.get(book.id);
    if (genres) {
      for (const g of genres) {
        if (sourceGenres.has(g)) score += 10;
      }
    }

    // Same author: +5
    if (authorId && book.author_id === authorId) score += 5;

    // Language alone is not evidence of similar content.
    if (score === 0) continue;

    // Same language: +3
    if (language && book.language === language) score += 3;

    if (score > 0) {
      scored.push({
        id: book.id,
        title: book.title,
        cover_image: book.cover_image,
        author_id: book.author_id,
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, limit);
}
