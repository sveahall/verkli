import "server-only";
import { isBillingStatusActive } from "@/lib/billing/state";
import { parseBillingPlan } from "@/lib/billing/plans";
import { normalizePricingModel } from "@/lib/books/pricing";
import { createClient } from "@/lib/supabase/server";

export type OfflineChapterAccessRequest = {
  bookId: string;
  editionId: string;
  chapterIds: string[];
  ownerUserId: string | null;
  /** Trusted server policy only; never accept a browser-provided expiry. */
  policy: { expiresAt: number } | null;
};

export type OfflineChapterGrant = {
  chapterId: string;
  source: "author" | "free" | "book_purchase" | "chapter_purchase" | "plus" | "author_subscription";
  /** Null means the current right has no scheduled expiry, not an unlimited lease. */
  rightExpiresAt: number | null;
  entitlementId?: string;
};

export type OfflineChapterAccess =
  | { ok: true; userId: string; bookId: string; editionId: string; expiresAt: number; grants: OfflineChapterGrant[] }
  | { ok: false; reason: "invalid_request" | "unverified_owner" | "unpublished" | "forbidden" | "verification_failed" };

function futureExpiry(value: string | null, now: number): number | null {
  const expiry = value ? Date.parse(value) : NaN;
  return Number.isSafeInteger(expiry) && expiry > now ? expiry : null;
}

/** Dormant adapter: no production callers and no lease/key/cache operations.
 * Always authenticates online. ownerUserId binds this request to that identity;
 * it does not prove persistent browser-storage ownership or permit cold starts.
 * Uses only the cookie/RLS client, including for subscription metadata. */
export async function authorizeOfflineChapters(request: OfflineChapterAccessRequest): Promise<OfflineChapterAccess> {
  const { bookId, editionId, ownerUserId } = request;
  const chapterIds = [...request.chapterIds];
  const policyEnd = request.policy?.expiresAt;
  const now = Date.now();
  if (!bookId || !editionId || !chapterIds.length || chapterIds.length > 500
    || chapterIds.some((id) => !id) || new Set(chapterIds).size !== chapterIds.length
    || typeof policyEnd !== "number" || !Number.isSafeInteger(policyEnd) || policyEnd <= now) {
    return { ok: false, reason: "invalid_request" };
  }
  if (!ownerUserId) return { ok: false, reason: "unverified_owner" };

  let stage = "authentication";
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.id !== ownerUserId) return { ok: false, reason: "unverified_owner" };

    stage = "book";
    const { data: book, error: bookError } = await supabase.from("books")
      .select("id, author_id, status, price_amount, pricing_model").eq("id", bookId).maybeSingle();
    if (bookError) throw bookError;
    if (!book || book.status !== "PUBLISHED") return { ok: false, reason: "unpublished" };
    const model = normalizePricingModel(book.pricing_model);
    // Unknown pricing is not evidence of a free grant.
    if (!model || typeof book.price_amount !== "number" || !Number.isSafeInteger(book.price_amount) || book.price_amount < 0) {
      return { ok: false, reason: "forbidden" };
    }

    stage = "edition";
    const { data: edition, error: editionError } = await supabase.from("book_versions")
      .select("id, published_at, published_chapter_count, visibility").eq("id", editionId).eq("book_id", bookId).maybeSingle();
    if (editionError) throw editionError;
    const count = edition?.published_chapter_count;
    const publishedAt = edition?.published_at ? Date.parse(edition.published_at) : NaN;
    if (!edition || !["public", "followers"].includes(edition.visibility)
      || !Number.isFinite(publishedAt) || publishedAt > now || typeof count !== "number" || !Number.isSafeInteger(count) || count <= 0) {
      return { ok: false, reason: "unpublished" };
    }
    if (edition.visibility === "followers" && book.author_id !== user.id) {
      stage = "follower visibility";
      const { data: follow, error: followError } = await supabase.from("author_followers")
        .select("author_id").eq("author_id", book.author_id).eq("follower_id", user.id).maybeSingle();
      if (followError) throw followError;
      if (!follow) return { ok: false, reason: "forbidden" };
    }

    stage = "chapters";
    const { data: chapters, error: chaptersError } = await supabase.from("chapters")
      .select("id, order").eq("book_id", bookId).eq("book_version_id", editionId)
      .is("deleted_at", null).in("id", chapterIds);
    if (chaptersError) throw chaptersError;
    const available = new Set(chapters?.map((chapter) => chapter.id));
    if (available.size !== chapterIds.length || chapterIds.some((id) => !available.has(id))
      || chapters?.some((chapter) => !Number.isSafeInteger(chapter.order) || chapter.order < 0 || chapter.order >= count)) {
      return { ok: false, reason: "unpublished" };
    }

    const grants = new Map<string, OfflineChapterGrant>();
    const grantMissing = (source: OfflineChapterGrant["source"], rightExpiresAt: number | null, entitlementId?: string) => {
      for (const chapterId of chapterIds) {
        if (!grants.has(chapterId)) grants.set(chapterId, { chapterId, source, rightExpiresAt, ...(entitlementId ? { entitlementId } : {}) });
      }
    };
    if (book.author_id === user.id) grantMissing("author", null);
    else if (book.price_amount === 0) grantMissing("free", null);
    else {
      stage = "book purchase";
      const { data: purchase, error: purchaseError } = await supabase.from("entitlements")
        .select("id").eq("user_id", user.id).eq("book_id", bookId).eq("source", "purchase")
        .is("chapter_id", null).maybeSingle();
      if (purchaseError) throw purchaseError;
      if (purchase?.id) grantMissing("book_purchase", null, purchase.id);

      if (grants.size < chapterIds.length && model === "per_chapter") {
        stage = "chapter purchases";
        const { data: purchases, error: purchasesError } = await supabase.from("entitlements")
          .select("id, chapter_id").eq("user_id", user.id).eq("book_id", bookId).eq("source", "purchase").in("chapter_id", chapterIds);
        if (purchasesError) throw purchasesError;
        for (const purchase of purchases ?? []) {
          if (purchase.id && purchase.chapter_id && chapterIds.includes(purchase.chapter_id)) {
            grants.set(purchase.chapter_id, { chapterId: purchase.chapter_id, source: "chapter_purchase", rightExpiresAt: null, entitlementId: purchase.id });
          }
        }
      }
      if (grants.size < chapterIds.length) {
        stage = "reader subscription";
        const { data: billing, error: billingError } = await supabase.from("billing_accounts")
          .select("plan, status, current_period_end").eq("user_id", user.id).eq("role", "reader").maybeSingle();
        if (billingError) throw billingError;
        const plan = parseBillingPlan(billing?.plan);
        const expiry = futureExpiry(billing?.current_period_end ?? null, now);
        // Match existing reader-role Pro-to-Plus scoping, without an admin client.
        if (billing && isBillingStatusActive(billing.status) && (plan === "plus" || plan === "pro") && expiry !== null) grantMissing("plus", expiry);
      }
      if (grants.size < chapterIds.length) {
        stage = "author subscription";
        const { data: subscription, error: subscriptionError } = await supabase.from("author_subscriptions")
          .select("id, current_period_end").eq("subscriber_user_id", user.id).eq("author_id", book.author_id).eq("status", "active").maybeSingle();
        if (subscriptionError) throw subscriptionError;
        const expiry = futureExpiry(subscription?.current_period_end ?? null, now);
        if (subscription?.id && expiry !== null) grantMissing("author_subscription", expiry, subscription.id);
      }
    }
    if (grants.size !== chapterIds.length) return { ok: false, reason: "forbidden" };
    const orderedGrants = chapterIds.map((id) => grants.get(id)!);
    const expiresAt = Math.min(policyEnd, ...orderedGrants.map((grant) => grant.rightExpiresAt ?? policyEnd));
    if (expiresAt <= Date.now()) return { ok: false, reason: "forbidden" };
    return { ok: true, userId: user.id, bookId, editionId, expiresAt, grants: orderedGrants };
  } catch {
    console.error("[offline access] Could not verify chapter access", { bookId, editionId, stage });
    return { ok: false, reason: "verification_failed" };
  }
}
