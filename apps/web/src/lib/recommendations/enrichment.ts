import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoredBook } from "./scoring";

export interface EnrichedBook extends ScoredBook {
  author_name: string;
}

/**
 * Enrich scored books with author display names from profiles.
 */
export async function enrichWithAuthors(
  supabase: SupabaseClient,
  books: ScoredBook[]
): Promise<EnrichedBook[]> {
  if (books.length === 0) return [];

  const authorIds = [...new Set(books.map((b) => b.author_id))];

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", authorIds);

  if (error) {
    console.error("[enrichWithAuthors] failed to fetch profiles", error.message);
  }

  const nameMap = new Map<string, string>();
  for (const p of profiles ?? []) {
    nameMap.set(p.user_id, p.display_name ?? "Okänd författare");
  }

  return books.map((book) => ({
    ...book,
    author_name: nameMap.get(book.author_id) ?? "Okänd författare",
  }));
}
