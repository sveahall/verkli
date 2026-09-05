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

type BookPurchaseEntitlementLookupResult =
  | { status: "present" }
  | { status: "absent" }
  | { status: "unavailable"; error: unknown };

type BookPurchaseEntitlementLookupArgs = {
  supabase: SupabaseLikeClient;
  userId: string;
  bookId: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unavailableForMalformedEntitlement(): BookPurchaseEntitlementLookupResult {
  return {
    status: "unavailable",
    error: new Error("[purchase access] Entitlement lookup returned malformed data"),
  };
}

function isMissingEntitlementChapterColumn(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error.code === "42703"
    && error.message === "column entitlements.chapter_id does not exist";
}

async function lookupLegacyBookPurchaseEntitlement({
  supabase,
  userId,
  bookId,
}: BookPurchaseEntitlementLookupArgs): Promise<BookPurchaseEntitlementLookupResult> {
  try {
    const { data, error } = await supabase
      .from("entitlements")
      .select("*")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .eq("source", "purchase")
      .maybeSingle();

    if (error !== null) return { status: "unavailable", error };
    if (data === null) return { status: "absent" };
    if (!isRecord(data)
      || !isNonEmptyString(data.id)
      || data.user_id !== userId
      || data.book_id !== bookId
      || data.source !== "purchase") {
      return unavailableForMalformedEntitlement();
    }

    const hasChapterId = Object.prototype.hasOwnProperty.call(data, "chapter_id");
    if (hasChapterId && data.chapter_id !== null) {
      return unavailableForMalformedEntitlement();
    }

    return { status: "present" };
  } catch (error) {
    return { status: "unavailable", error };
  }
}

export async function lookupBookPurchaseEntitlement({
  supabase,
  userId,
  bookId,
}: BookPurchaseEntitlementLookupArgs): Promise<BookPurchaseEntitlementLookupResult> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(bookId)) {
    return {
      status: "unavailable",
      error: new Error("[purchase access] Invalid entitlement lookup identifiers"),
    };
  }

  try {
    const { data, error } = await supabase
      .from("entitlements")
      .select("id")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .eq("source", "purchase")
      .is("chapter_id", null)
      .maybeSingle();

    if (error !== null) {
      if (isMissingEntitlementChapterColumn(error)) {
        return lookupLegacyBookPurchaseEntitlement({ supabase, userId, bookId });
      }
      return { status: "unavailable", error };
    }
    if (data === null) return { status: "absent" };
    if (!isRecord(data) || !isNonEmptyString(data.id)) {
      return unavailableForMalformedEntitlement();
    }
    return { status: "present" };
  } catch (error) {
    return { status: "unavailable", error };
  }
}

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
    const bookEntitlement = await lookupBookPurchaseEntitlement({
      supabase,
      userId,
      bookId,
    });

    if (bookEntitlement.status === "unavailable") {
      console.error("[books/access] entitlement check failed; denying access", {
        userId,
        bookId,
        message: isRecord(bookEntitlement.error) && typeof bookEntitlement.error.message === "string"
          ? bookEntitlement.error.message
          : "Entitlement lookup unavailable",
      });
    }

    if (bookEntitlement.status === "present") {
      return { access: "full", reason: "purchased" };
    }

    // For per_chapter: check chapter-specific entitlement
    if (pricingModel === "per_chapter") {
      const { data: chapterEntitlement, error: chapterEntitlementError } = await supabase
        .from("entitlements")
        .select("id")
        .eq("user_id", userId)
        .eq("book_id", bookId)
        .eq("chapter_id", chapterId)
        .eq("source", "purchase")
        .maybeSingle();

      if (chapterEntitlementError) {
        console.error("[books/access] chapter entitlement check failed; denying access", {
          userId,
          bookId,
          chapterId,
          message: chapterEntitlementError.message,
        });
      }

      if (chapterEntitlementError === null
        && isRecord(chapterEntitlement)
        && isNonEmptyString(chapterEntitlement.id)) {
        return { access: "full", reason: "purchased" };
      }
    }

    try {
      const billing = await getBillingStateForUser(userId, "reader");
      if (billing.ok && billing.state.isPlusActive) {
        return { access: "full", reason: "plus" };
      }
    } catch {
      // Non-blocking — fall through to preview/locked
    }

    // Author subscription: active subscription to this book's author grants full access
    if (authorId) {
      const { data: authorSub, error: authorSubError } = await supabase
        .from("author_subscriptions" as never)
        .select("id")
        .eq("subscriber_user_id", userId)
        .eq("author_id", authorId)
        .eq("status" as never, "active")
        .maybeSingle();

      if (authorSubError) {
        console.error("[books/access] author subscription check failed; denying access", {
          userId,
          authorId,
          message: authorSubError.message,
        });
      }

      if (authorSub) {
        return { access: "full", reason: "purchased" };
      }
    }
  }

  const { data: allChapters, error: allChaptersError } = await supabase
    .from("chapters")
    .select("id, title, order")
    .eq("book_version_id", bookVersionId)
    .order("order", { ascending: true });

  if (allChaptersError) {
    // An empty list here silently collapses the preview window, so a reader who
    // should see the first chapter free sees nothing instead.
    console.error("[books/access] chapter list failed; preview window collapses", {
      bookId,
      bookVersionId,
      message: allChaptersError.message,
    });
  }

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
 * 3) the user has a purchase entitlement for the book (book-level)
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

  const entitlement = await lookupBookPurchaseEntitlement({
    supabase,
    userId,
    bookId,
  });

  if (entitlement.status === "present") {
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

  // Author subscription: active subscription to this book's author grants full access
  if (authorId) {
    const { data: authorSub } = await supabase
      .from("author_subscriptions" as never)
      .select("id")
      .eq("subscriber_user_id", userId)
      .eq("author_id", authorId)
      .eq("status" as never, "active")
      .maybeSingle();
    if (authorSub) {
      return true;
    }
  }

  return false;
}
