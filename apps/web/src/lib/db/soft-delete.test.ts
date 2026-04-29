import { describe, expect, it, vi } from "vitest";
import {
  applyActiveFilter,
  restoreSoftDeleted,
  SOFT_DELETE_COLUMN,
  SOFT_DELETE_TABLES,
  softDelete,
} from "./soft-delete";

describe("SOFT_DELETE_TABLES", () => {
  it("includes the 11 tables specified in the Sprint 0.5 plan", () => {
    const expected = [
      "books",
      "chapters",
      "comments",
      "messages",
      "marketing_campaigns",
      "marketing_posts",
      "reviews",
      "polls",
      "poll_options",
      "book_clubs",
      "book_club_messages",
    ];
    expect([...SOFT_DELETE_TABLES].sort()).toEqual(expected.sort());
  });
});

describe("applyActiveFilter", () => {
  it("calls .is('deleted_at', null) on the underlying query", () => {
    const isFn = vi.fn().mockImplementation(function (this: unknown) {
      return this;
    });
    const fakeQuery = { is: isFn } as unknown as {
      is: (col: string, val: unknown) => unknown;
    };
    applyActiveFilter(fakeQuery);
    expect(isFn).toHaveBeenCalledWith(SOFT_DELETE_COLUMN, null);
  });
});

describe("softDelete", () => {
  function fakeSupabase(result: { error?: { message?: string } | null; count?: number | null }) {
    const final = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ is: final });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    return { from, _final: final, _update: update, _eq: eq };
  }

  it("UPDATEs deleted_at and filters by id + active row", async () => {
    const sb = fakeSupabase({ count: 1, error: null });
    const fixedDate = new Date("2026-04-29T12:00:00Z");
    const updated = await softDelete(sb, "books", "book-1", fixedDate);
    expect(updated).toBe(1);
    expect(sb.from).toHaveBeenCalledWith("books");
    expect(sb._update).toHaveBeenCalledWith(
      { deleted_at: fixedDate.toISOString() },
      { count: "exact" }
    );
    expect(sb._eq).toHaveBeenCalledWith("id", "book-1");
    expect(sb._final).toHaveBeenCalledWith("deleted_at", null);
  });

  it("returns 0 when no rows updated (already soft-deleted)", async () => {
    const sb = fakeSupabase({ count: 0, error: null });
    const updated = await softDelete(sb, "comments", "c-1");
    expect(updated).toBe(0);
  });

  it("throws when Supabase returns an error", async () => {
    const sb = fakeSupabase({ error: { message: "rls denied" } });
    await expect(softDelete(sb, "messages", "m-1")).rejects.toThrow(/rls denied/);
  });
});

describe("restoreSoftDeleted", () => {
  function fakeSupabase(result: { error?: { message?: string } | null; count?: number | null }) {
    const final = vi.fn().mockResolvedValue(result);
    const not = vi.fn().mockReturnValue(final);
    // Wait — `.not` returns a thenable in supabase-js; flatten it here by
    // making the .not call resolve directly.
    const eq = vi.fn().mockReturnValue({ not });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    return { from, _not: not, _final: final, _update: update, _eq: eq };
  }

  it("UPDATEs deleted_at to null only on previously-deleted rows", async () => {
    // The mock above returns `final` from `.not(...)`. Wire that through
    // by aliasing.
    const sb = fakeSupabase({ count: 1, error: null });
    sb._not.mockResolvedValue({ count: 1, error: null });
    const restored = await restoreSoftDeleted(sb, "books", "book-1");
    expect(restored).toBe(1);
    expect(sb.from).toHaveBeenCalledWith("books");
    expect(sb._update).toHaveBeenCalledWith({ deleted_at: null }, { count: "exact" });
    expect(sb._eq).toHaveBeenCalledWith("id", "book-1");
    expect(sb._not).toHaveBeenCalledWith("deleted_at", "is", null);
  });

  it("throws on supabase error", async () => {
    const sb = fakeSupabase({ error: { message: "boom" } });
    sb._not.mockResolvedValue({ error: { message: "boom" }, count: null });
    await expect(restoreSoftDeleted(sb, "comments", "c-1")).rejects.toThrow(/boom/);
  });
});
