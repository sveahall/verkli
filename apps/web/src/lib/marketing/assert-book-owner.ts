import type { SupabaseClient } from "@supabase/supabase-js";
import { apiError, E_BOOK_NOT_FOUND } from "@/lib/api-errors";

type BookRow = { id: string; title?: string | null };

/**
 * Verifies that bookId exists and is owned by userId.
 * Use after requireAuthorAndMarketingEnabled for all marketing routes that take a bookId.
 * Returns NextResponse (404) if book not found or not owned.
 */
export async function assertBookOwned(
  supabase: SupabaseClient,
  userId: string,
  bookId: string
): Promise<
  | { ok: true; book: BookRow }
  | { ok: false; response: Response }
> {
  const { data: book, error } = await supabase
    .from("books")
    .select("id, title")
    .eq("id", bookId)
    .eq("author_id", userId)
    .maybeSingle();

  if (error || !book) {
    return { ok: false, response: apiError(E_BOOK_NOT_FOUND, 404) };
  }

  return { ok: true, book: book as BookRow };
}
