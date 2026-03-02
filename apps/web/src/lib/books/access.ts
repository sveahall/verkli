import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPaidPriceAmount,
  normalizePriceAmount,
  normalizePricingModel,
} from "@/lib/books/pricing";
import { getBillingStateForUser } from "@/lib/billing/server";

export type SupabaseLikeClient = Pick<SupabaseClient, "from">;

export type ReadAccessResult =
  | { access: "full"; reason: "free" | "author" | "purchased" | "plus" }
  | { access: "preview"; reason: "first_chapter"; isLastPreview: boolean }
  | { access: "locked" };

type GetReadAccessArgs = {
  supabase: SupabaseLikeClient;
  userId: string | null | undefined;
  bookId: string;
  chapterId: string;
  bookVersionId: string;
  bookAuthorId?: string | null;
  bookPriceAmount?: number | null;
  bookPricingModel?: string | null;
};

export async function getReadAccess({
  supabase,
  userId,
  bookId,
  chapterId,
  bookVersionId,
  bookAuthorId,
  bookPriceAmount,
  bookPricingModel,
}: GetReadAccessArgs): Promise<ReadAccessResult> {
  let authorId = bookAuthorId ?? null;
  let priceAmount = normalizePriceAmount(bookPriceAmount ?? null);
  let pricingModel = normalizePricingModel(bookPricingModel ?? "book_only");
  if (priceAmount != null && priceAmount < 0) {
    priceAmount = 0;
  }

  if (authorId == null || bookPriceAmount == null || bookPricingModel == null) {
    const { data: book, error } = await supabase
      .from("books")
      .select("author_id, price_amount, pricing_model")
      .eq("id", bookId)
      .maybeSingle();

    if (error || !book) {
      return { access: "locked" };
    }

    authorId = String(book.author_id ?? "");
    const normalizedFromDb = normalizePriceAmount(
      typeof book.price_amount === "number" ? book.price_amount : null,
    );
    priceAmount = normalizedFromDb != null && normalizedFromDb > 0 ? normalizedFromDb : 0;
    pricingModel = normalizePricingModel(
      typeof book.pricing_model === "string" ? book.pricing_model : "book_only",
    );
  }

  if (!pricingModel) {
    return { access: "locked" };
  }

  if (!isPaidPriceAmount(priceAmount)) {
    return { access: "full", reason: "free" };
  }

  if (userId && authorId === userId) {
    return { access: "full", reason: "author" };
  }

  if (userId) {
    const { data: entitlement } = await supabase
      .from("entitlements")
      .select("id")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .eq("source", "purchase")
      .maybeSingle();

    if (entitlement) {
      return { access: "full", reason: "purchased" };
    }

    try {
      const billing = await getBillingStateForUser(userId, "reader");
      if (billing.ok && billing.state.isPlusActive) {
        return { access: "full", reason: "plus" };
      }
    } catch {
      // Non-blocking — fall through to preview/locked
    }
  }

  const { data: allChapters } = await supabase
    .from("chapters")
    .select("id, title, order")
    .eq("book_version_id", bookVersionId)
    .order("order", { ascending: true });

  const chapters = allChapters ?? [];
  const contentPattern = /^(kapitel|chapter)\s+\d/i;
  const firstContentIndex = chapters.findIndex((c) => contentPattern.test(c.title ?? ""));
  const previewCutoff = firstContentIndex >= 0 ? firstContentIndex : 0;
  const currentIndex = chapters.findIndex((c) => c.id === chapterId);

  if (currentIndex >= 0 && currentIndex <= previewCutoff) {
    return { access: "preview", reason: "first_chapter", isLastPreview: currentIndex === previewCutoff };
  }

  return { access: "locked" };
}

type CanUserReadBookArgs = {
  supabase: SupabaseLikeClient;
  userId: string | null | undefined;
  bookId: string;
  bookAuthorId?: string | null;
  bookPriceAmount?: number | null;
  bookPricingModel?: string | null;
};

/**
 * Access helper for reader content gating (book-level).
 * True when:
 * 1) the book is free
 * 2) the user is the book author
 * 3) the user has a purchase entitlement for the book
 * 4) the user has an active Plus subscription
 */
export async function canUserReadBook({
  supabase,
  userId,
  bookId,
  bookAuthorId,
  bookPriceAmount,
  bookPricingModel,
}: CanUserReadBookArgs): Promise<boolean> {
  let authorId = bookAuthorId ?? null;
  let priceAmount = normalizePriceAmount(bookPriceAmount ?? null);
  let pricingModel = normalizePricingModel(bookPricingModel ?? "book_only");
  if (priceAmount != null && priceAmount < 0) {
    priceAmount = 0;
  }

  if (authorId == null || bookPriceAmount == null || bookPricingModel == null) {
    const { data: book, error } = await supabase
      .from("books")
      .select("author_id, price_amount, pricing_model")
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
    pricingModel = normalizePricingModel(
      typeof book.pricing_model === "string" ? book.pricing_model : "book_only"
    );
  }

  if (userId && authorId === userId) {
    return true;
  }

  if (!pricingModel) {
    return false;
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

  if (entitlement) {
    return true;
  }

  try {
    const billing = await getBillingStateForUser(userId, "reader");
    if (billing.ok && billing.state.isPlusActive) {
      return true;
    }
  } catch {
    // Non-blocking
  }

  return false;
}
