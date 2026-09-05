import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/server", () => ({
  getBillingStateForUser: vi.fn().mockResolvedValue({ ok: false }),
}));

import { getReadAccess, type SupabaseLikeClient } from "./access";

// ── Supabase mock builder ───────────────────────────────────────────

type Row = Record<string, unknown>;

function makeSupabase(config: {
  book?: Row | null;
  bookEntitlement?: Row | null;
  chapterEntitlement?: Row | null;
  authorSubscription?: Row | null;
  chapters?: Row[];
  /** Model a database failure on the entitlements read. */
  entitlementError?: { message: string };
}): SupabaseLikeClient {
  return {
    from(table: string) {
      if (table === "books") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: config.book ?? null, error: null }),
                };
              },
            };
          },
        };
      }
      if (table === "entitlements") {
        // Track call chain to distinguish book-level vs chapter-level
        let isChapterLevel = false;
        const chain = {
          select() { return chain; },
          eq(_col: string, _val: unknown) { // eslint-disable-line @typescript-eslint/no-unused-vars
            if (_col === "chapter_id") isChapterLevel = true;
            return chain;
          },
          is() { return chain; },
          maybeSingle: async () => ({
            data: config.entitlementError
              ? null
              : isChapterLevel
                ? (config.chapterEntitlement ?? null)
                : (config.bookEntitlement ?? null),
            error: config.entitlementError ?? null,
          }),
        };
        return chain;
      }
      if (table === "chapters") {
        return {
          select() {
            return {
              eq() {
                return {
                  order: async () => ({ data: config.chapters ?? [], error: null }),
                };
              },
            };
          },
        };
      }
      if (table === "author_subscriptions") {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: config.authorSubscription ?? null, error: null }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseLikeClient;
}

const baseArgs = {
  bookId: "book-1",
  chapterId: "ch-1",
  bookVersionId: "v-1",
};

// ── Tests ───────────────────────────────────────────────────────────

describe("getReadAccess", () => {
  it("grants full access for free books", async () => {
    const supabase = makeSupabase({
      book: { author_id: "author-1", price_amount: 0, pricing_model: "book_only" },
    });

    const result = await getReadAccess({
      supabase,
      userId: "reader-1",
      ...baseArgs,
    });

    expect(result).toEqual({ access: "full", reason: "free" });
  });

  it("grants full access for book author", async () => {
    const supabase = makeSupabase({
      book: { author_id: "author-1", price_amount: 4900, pricing_model: "book_only" },
    });

    const result = await getReadAccess({
      supabase,
      userId: "author-1",
      ...baseArgs,
    });

    expect(result).toEqual({ access: "full", reason: "author" });
  });

  it("grants full access with book-level purchase entitlement", async () => {
    const supabase = makeSupabase({
      book: { author_id: "author-1", price_amount: 4900, pricing_model: "book_only" },
      bookEntitlement: { id: "ent-1" },
    });

    const result = await getReadAccess({
      supabase,
      userId: "reader-1",
      ...baseArgs,
    });

    expect(result).toEqual({ access: "full", reason: "purchased" });
  });

  it("grants full access with chapter entitlement (per_chapter model)", async () => {
    const supabase = makeSupabase({
      book: { author_id: "author-1", price_amount: 4900, pricing_model: "per_chapter" },
      bookEntitlement: null,
      chapterEntitlement: { id: "ent-ch-1" },
    });

    const result = await getReadAccess({
      supabase,
      userId: "reader-1",
      ...baseArgs,
    });

    expect(result).toEqual({ access: "full", reason: "purchased" });
  });

  it("returns locked when book not found", async () => {
    const supabase = makeSupabase({ book: null });

    const result = await getReadAccess({
      supabase,
      userId: "reader-1",
      ...baseArgs,
    });

    expect(result).toEqual({ access: "locked" });
  });

  it("returns preview for first chapter of paid book without entitlement", async () => {
    const chapters = [
      { id: "ch-intro", title: "Introduction", order: 0 },
      { id: "ch-1", title: "Chapter 1", order: 1 },
      { id: "ch-2", title: "Chapter 2", order: 2 },
    ];

    const supabase = makeSupabase({
      book: { author_id: "author-1", price_amount: 4900, pricing_model: "book_only" },
      bookEntitlement: null,
      chapters,
    });

    const result = await getReadAccess({
      supabase,
      userId: "reader-1",
      bookId: "book-1",
      chapterId: "ch-intro",
      bookVersionId: "v-1",
    });

    expect(result.access).toBe("preview");
    if (result.access === "preview") {
      expect(result.reason).toBe("first_chapter");
    }
  });

  it("returns locked for later chapters of paid book without entitlement", async () => {
    const chapters = [
      { id: "ch-intro", title: "Introduction", order: 0 },
      { id: "ch-1", title: "Chapter 1", order: 1 },
      { id: "ch-2", title: "Chapter 2", order: 2 },
    ];

    const supabase = makeSupabase({
      book: { author_id: "author-1", price_amount: 4900, pricing_model: "book_only" },
      bookEntitlement: null,
      chapters,
    });

    const result = await getReadAccess({
      supabase,
      userId: "reader-1",
      bookId: "book-1",
      chapterId: "ch-2",
      bookVersionId: "v-1",
    });

    expect(result).toEqual({ access: "locked" });
  });

  it("grants full access for anonymous user on free book", async () => {
    const supabase = makeSupabase({
      book: { author_id: "author-1", price_amount: null, pricing_model: "book_only" },
    });

    const result = await getReadAccess({
      supabase,
      userId: null,
      ...baseArgs,
    });

    expect(result).toEqual({ access: "full", reason: "free" });
  });

  it("uses inline pricing context when provided", async () => {
    // Should not hit books table
    const supabase: SupabaseLikeClient = {
      from(table: string) {
        if (table === "books") throw new Error("Should not query books");
        if (table === "entitlements") {
          return {
            select() { return this; },
            eq() { return this; },
            is() { return this; },
            maybeSingle: async () => ({ data: null, error: null }),
          };
        }
        if (table === "chapters") {
          return {
            select() { return this; },
            eq() { return this; },
            order: async () => ({ data: [{ id: "ch-1", title: "Chapter 1", order: 0 }], error: null }),
          };
        }
        if (table === "author_subscriptions") {
          return {
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({ data: null, error: null }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    } as unknown as SupabaseLikeClient;

    const result = await getReadAccess({
      supabase,
      userId: "reader-1",
      bookId: "book-1",
      chapterId: "ch-1",
      bookVersionId: "v-1",
      bookAuthorId: "author-1",
      bookPriceAmount: 4900,
      bookPricingModel: "book_only",
    });

    // Should get preview for first content chapter
    expect(result.access).toBe("preview");
  });

  it("grants full access via Plus subscription", async () => {
    const { getBillingStateForUser } = await import("@/lib/billing/server");
    vi.mocked(getBillingStateForUser).mockResolvedValueOnce({
      ok: true,
      state: { isPlusActive: true },
    } as never);

    const supabase = makeSupabase({
      book: { author_id: "author-1", price_amount: 4900, pricing_model: "book_only" },
      bookEntitlement: null,
    });

    const result = await getReadAccess({
      supabase,
      userId: "reader-plus",
      ...baseArgs,
    });

    expect(result).toEqual({ access: "full", reason: "plus" });
  });

  it("denies access when the entitlement check fails, and says so in the log", async () => {
    // Deny-on-error is the correct outcome: a database blip must not hand out a
    // paid book. The bug was that it happened in silence — a reader who HAD
    // paid met a paywall and nothing recorded why.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const supabase = makeSupabase({
      book: { author_id: "author-1", price_amount: 4900, pricing_model: "book_only" },
      bookEntitlement: { id: "ent-1" }, // would have granted access, but the read fails
      entitlementError: { message: "connection reset" },
      chapters: [{ id: "ch-1", title: "Kapitel 1", order: 1 }],
    });

    const result = await getReadAccess({ supabase, userId: "reader-1", ...baseArgs });

    expect(result.access).not.toBe("full");
    expect(spy).toHaveBeenCalledWith(
      "[books/access] entitlement check failed; denying access",
      expect.objectContaining({ message: "connection reset" })
    );

    spy.mockRestore();
  });

  it("still grants access on a healthy entitlement read", async () => {
    // Guards the test above from passing because access is broken outright.
    const supabase = makeSupabase({
      book: { author_id: "author-1", price_amount: 4900, pricing_model: "book_only" },
      bookEntitlement: { id: "ent-1" },
      chapters: [{ id: "ch-1", title: "Kapitel 1", order: 1 }],
    });

    const result = await getReadAccess({ supabase, userId: "reader-1", ...baseArgs });

    expect(result).toEqual({ access: "full", reason: "purchased" });
  });
});
