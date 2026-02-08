import type { SupabaseClient } from "@supabase/supabase-js";
import { isPaidPriceAmount, normalizePriceAmount } from "@/lib/books/pricing";

export type SupabaseLikeClient = Pick<SupabaseClient, "from">;

type CanUserReadBookArgs = {
  supabase: SupabaseLikeClient;
  userId: string | null | undefined;
  bookId: string;
  bookAuthorId?: string | null;
  bookPriceAmount?: number | null;
};

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
  if (priceAmount != null && priceAmount < 0) {
    priceAmount = 0;
  }

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
    const normalizedFromDb = normalizePriceAmount(
      typeof book.price_amount === "number" ? book.price_amount : null
    );
    priceAmount = normalizedFromDb != null && normalizedFromDb > 0 ? normalizedFromDb : 0;
  }

  if (userId && authorId === userId) {
    return true;
  }

  if (!isPaidPriceAmount(priceAmount)) {
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
