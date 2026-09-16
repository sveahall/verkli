import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { scoreSimilarBooks } from "./scoring";

function catalog(errorTable?: string) {
  const books = [
    { id: "match", title: "Match", cover_image: null, author_id: "other", language: "en", status: "PUBLISHED" },
    { id: "unrelated", title: "Unrelated", cover_image: null, author_id: "other", language: "en", status: "PUBLISHED" },
    { id: "source", title: "Source", cover_image: null, author_id: "source-author", language: "en", status: "PUBLISHED" },
    { id: "draft", title: "Draft", cover_image: null, author_id: "source-author", language: "en", status: "DRAFT" },
  ];
  return {
    from(table: string) {
      let rows: Record<string, unknown>[] = table === "books" ? [...books] : [{ book_id: "match", genre_id: "fiction" }];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return query; },
        neq: (key: string, value: unknown) => { rows = value === null ? [] : rows.filter((r) => r[key] !== value); return query; },
        in: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => void) => resolve({ data: table === errorTable ? null : rows, error: table === errorTable ? { message: "database unavailable" } : null }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

describe("scoreSimilarBooks", () => {
  it("does not label an unrelated same-language book as similar", async () => {
    const books = await scoreSimilarBooks(catalog(), "source", "source-author", "en", ["fiction"], 8);
    expect(books.map((b) => b.id)).toEqual(["match"]);
    expect(books[0].score).toBe(13);
  });

  it("can score genre preferences without excluding an invented source book", async () => {
    const books = await scoreSimilarBooks(catalog(), null, null, null, ["fiction"], 8);
    expect(books.map((b) => b.id)).toEqual(["match"]);
    expect(books[0].score).toBe(10);
  });

  it.each(["books", "book_genres"])("does not disguise a %s query failure as empty recommendations", async (table) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(scoreSimilarBooks(catalog(table), "source", "source-author", "en", ["fiction"], 8)).rejects.toThrow();
    log.mockRestore();
  });
});
