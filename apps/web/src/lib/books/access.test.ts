import { describe, expect, it } from "vitest";
import { canUserReadBook, type SupabaseLikeClient } from "./access";

type Row = Record<string, unknown>;

function makeSupabase(rows: { books?: Row; entitlement?: Row | null }): SupabaseLikeClient {
  return {
    from(table: string) {
      if (table === "books") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: rows.books ?? null, error: null }),
                };
              },
            };
          },
        };
      }
      if (table === "entitlements") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      eq() {
                        return {
                          maybeSingle: async () => ({ data: rows.entitlement ?? null, error: null }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseLikeClient;
}

describe("canUserReadBook", () => {
  it("returns true when book is free", async () => {
    const supabase = makeSupabase({ books: { author_id: "author-1", price_amount: 0 } });

    const result = await canUserReadBook({
      supabase,
      userId: null,
      bookId: "book-1",
    });

    expect(result).toBe(true);
  });

  it("returns true when user is author", async () => {
    const supabase = makeSupabase({ books: { author_id: "author-1", price_amount: 999 } });

    const result = await canUserReadBook({
      supabase,
      userId: "author-1",
      bookId: "book-1",
    });

    expect(result).toBe(true);
  });

  it("returns true when purchase entitlement exists", async () => {
    const supabase = makeSupabase({
      books: { author_id: "author-1", price_amount: 999 },
      entitlement: { id: "ent-1" },
    });

    const result = await canUserReadBook({
      supabase,
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(result).toBe(true);
  });

  it("returns false when paid and no entitlement", async () => {
    const supabase = makeSupabase({
      books: { author_id: "author-1", price_amount: 999 },
      entitlement: null,
    });

    const result = await canUserReadBook({
      supabase,
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(result).toBe(false);
  });

  it("blocks anonymous reader for paid book when pricing is already provided", async () => {
    const supabase: SupabaseLikeClient = {
      from(table: string) {
        if (table === "entitlements") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        eq() {
                          return {
                            maybeSingle: async () => ({ data: null, error: null }),
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    } as unknown as SupabaseLikeClient;

    const result = await canUserReadBook({
      supabase,
      userId: null,
      bookId: "book-1",
      bookAuthorId: "author-1",
      bookPriceAmount: 199,
    });

    expect(result).toBe(false);
  });
});
