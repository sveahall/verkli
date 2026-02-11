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

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, username")
    .in("user_id", authorIds);

  const nameMap = new Map<string, string>();
  for (const p of profiles ?? []) {
    const name =
      (typeof p.display_name === "string" ? p.display_name.trim() : "") ||
      (typeof p.username === "string" ? p.username.trim() : "") ||
      "Author";
    nameMap.set(p.user_id, name);
  }

  return books.map((book) => ({
    ...book,
    author_name: nameMap.get(book.author_id) ?? "Author",
  }));
}
