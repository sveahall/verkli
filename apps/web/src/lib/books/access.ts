import type { SupabaseClient } from "@supabase/supabase-js";

export type SupabaseLikeClient = Pick<SupabaseClient, "from">;

type CanUserReadBookArgs = {
  supabase: SupabaseLikeClient;
  userId: string | null | undefined;
  bookId: string;
  bookAuthorId?: string | null;
  bookPriceAmount?: number | null;
};

function normalizePriceAmount(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

/**
 * Access helper for reader content gating.
 * True when:
 * 1) the book is free
 * 2) the user is the book author
 * 3) the user has a purchase entitlement for the book
 */
export async function canUserReadBook({
  supabase,
  userId,
  bookId,
  bookAuthorId,
  bookPriceAmount,
}: CanUserReadBookArgs): Promise<boolean> {
  let authorId = bookAuthorId ?? null;
  let priceAmount = normalizePriceAmount(bookPriceAmount ?? null);

  if (authorId == null || bookPriceAmount == null) {
    const { data: book, error } = await supabase
      .from("books")
      .select("author_id, price_amount")
      .eq("id", bookId)
      .maybeSingle();

    if (error || !book) {
      return false;
    }

    authorId = String(book.author_id ?? "");
    priceAmount = normalizePriceAmount(
      typeof book.price_amount === "number" ? book.price_amount : null
    );
  }

  if (userId && authorId === userId) {
    return true;
  }

  if (priceAmount <= 0) {
    return true;
  }

  if (!userId) {
    return false;
  }

  const { data: entitlement } = await supabase
    .from("entitlements")
    .select("id")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .eq("source", "purchase")
    .maybeSingle();

  return Boolean(entitlement);
}
