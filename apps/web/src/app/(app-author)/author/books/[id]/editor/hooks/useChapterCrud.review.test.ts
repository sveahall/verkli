import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: mocks.createClient }));
const { assertReviewCanApply, persistReviewedChapterContent, persistAutosavedChapterContent } = await import("./useChapterCrud.review");

describe("review acceptance guard", () => {
  const base = {
    chapter: { id: "chapter-1", content: "old" }, expectedContent: "old",
    hasUnsavedChanges: false, isSaving: false, isDraining: false, pendingCount: 0, isApplying: false,
  };
  it.each([
    { hasUnsavedChanges: true }, { isSaving: true }, { isDraining: true }, { pendingCount: 1 }, { isApplying: true },
  ])("refuses an outstanding writer or unsaved changes: %j", (flags) => {
    expect(() => assertReviewCanApply({ ...base, ...flags })).toThrow("saving");
  });
  it("rejects a missing or changed chapter", () => {
    expect(() => assertReviewCanApply({ ...base, chapter: undefined })).toThrow("changed");
    expect(() => assertReviewCanApply({ ...base, expectedContent: "older" })).toThrow("changed");
  });
  it("compares null and empty string distinctly", () => {
    expect(() => assertReviewCanApply({ ...base, chapter: { id: "chapter-1", content: null }, expectedContent: "" })).toThrow("changed");
    expect(() => assertReviewCanApply({ ...base, chapter: { id: "chapter-1", content: null }, expectedContent: null })).not.toThrow();
  });
});

describe("review compare-and-swap persistence", () => {
  let row: { id: string; book_id: string; content: string | null; updated_at: string | null; version_number: number };
  let readFilters: Array<[string, unknown]>;
  let writeFilters: Array<[string, unknown]>;
  let writes: number;
  let readError: { message: string } | null;
  let writeError: { message: string } | null;
  let beforeUpdate: () => void;
  beforeEach(() => {
    row = { id: "chapter-1", book_id: "book-1", content: "old", updated_at: "2026-09-14T12:00:00.123456+00:00", version_number: 7 };
    readFilters = [];
    writeFilters = [];
    writes = 0;
    readError = null;
    writeError = null;
    beforeUpdate = () => {};
    mocks.createClient.mockReturnValue({
      from: (table: string) => {
        expect(table).toBe("chapters");
        return {
          select: (fields: string) => {
            expect(fields).toBe("id, content, updated_at, version_number");
            const query = {
              eq: (field: string, value: unknown) => { readFilters.push([field, value]); return query; },
              maybeSingle: async () => ({
                data: readFilters.every(([field, value]) => row[field as keyof typeof row] === value) ? { ...row } : null,
                error: readError,
              }),
            };
            return query;
          },
          update: (patch: { content: string }) => {
            writes++;
            beforeUpdate();
            const query = {
              eq: (field: string, value: unknown) => { writeFilters.push([field, value]); return query; },
              is: (field: string, value: unknown) => { writeFilters.push([field, value]); return query; },
              select: async (fields: string) => {
                expect(fields).toBe("id");
                if (writeError) return { data: null, error: writeError };
                const matched = writeFilters.every(([field, value]) => row[field as keyof typeof row] === value);
                if (matched) row.content = patch.content;
                return { data: matched ? [{ id: row.id }] : [], error: null };
              },
            };
            return query;
          },
        };
      },
    });
  });

  it("checks source content then saves only the unchanged book/chapter/timestamp", async () => {
    const next = { type: "doc", content: [] };
    expect(await persistReviewedChapterContent("book-1", "chapter-1", "old", next)).toBe(JSON.stringify(next));
    expect(row.content).toBe(JSON.stringify(next));
    expect(readFilters).toEqual([["book_id", "book-1"], ["id", "chapter-1"]]);
    expect(writeFilters).toEqual([["book_id", "book-1"], ["id", "chapter-1"], ["updated_at", "2026-09-14T12:00:00.123456+00:00"], ["version_number", 7]]);
  });
  it.each([
    ["book-other", "chapter-1", "old"], ["book-1", "chapter-other", "old"], ["book-1", "chapter-1", "outdated"],
  ])("rejects missing or mismatched source before attempting any write", async (bookId, chapterId, expected) => {
    await expect(persistReviewedChapterContent(bookId, chapterId, expected, { type: "doc" })).rejects.toThrow("changed");
    expect(writes).toBe(0);
    expect(row.content).toBe("old");
  });
  it("rejects if another tab updates after the read and preserves the newer content", async () => {
    beforeUpdate = () => {
      row.content = "newer content from another tab";
      row.updated_at = "2026-09-14T12:00:01.123456+00:00";
    };
    await expect(persistReviewedChapterContent("book-1", "chapter-1", "old", { type: "doc" })).rejects.toThrow("changed");
    expect(row.content).toBe("newer content from another tab");
  });
  it("does not let an autosave based on the old draft overwrite an accepted review", async () => {
    const correction = { type: "doc", content: [{ type: "text", text: "Corrected" }] };
    await persistReviewedChapterContent("book-1", "chapter-1", "old", correction);
    const result = await persistAutosavedChapterContent("book-1", "chapter-1", "old", { type: "doc", content: [] });
    expect(result.outcome).toBe("conflict");
    expect(row.content).toBe(JSON.stringify(correction));
    expect(writes).toBe(1);
  });

  it("rejects an autosave when a review lands between its read and write", async () => {
    beforeUpdate = () => {
      row.content = "Accepted correction";
      row.updated_at = "2026-09-14T12:00:02.123456+00:00";
    };
    const result = await persistAutosavedChapterContent("book-1", "chapter-1", "old", { type: "doc" });
    expect(result.outcome).toBe("conflict");
    expect(row.content).toBe("Accepted correction");
  });

  it("rejects a changed content revision even if the transaction timestamp is identical", async () => {
    beforeUpdate = () => {
      row.content = "Newer draft in the same transaction";
      row.version_number += 1;
    };
    await expect(persistReviewedChapterContent("book-1", "chapter-1", "old", { type: "doc" })).rejects.toThrow("changed");
    expect(row.content).toBe("Newer draft in the same transaction");
  });

  it("keeps even a long chapter out of URL filters", async () => {
    const longChapter = "A long chapter paragraph. ".repeat(10_000);
    row.content = longChapter;
    await persistReviewedChapterContent("book-1", "chapter-1", longChapter, { type: "doc" });
    for (const [field, value] of [...readFilters, ...writeFilters]) {
      expect(field).not.toBe("content");
      expect(String(value).length).toBeLessThan(100);
    }
  });
  it.each([null, ""])("fails closed when no usable revision timestamp exists: %s", async (timestamp) => {
    row.updated_at = timestamp;
    await expect(persistReviewedChapterContent("book-1", "chapter-1", "old", { type: "doc" })).rejects.toThrow("changed");
    expect(writes).toBe(0);
  });
  it("supports null-content chapters without treating null as empty text", async () => {
    row.content = null;
    await expect(persistReviewedChapterContent("book-1", "chapter-1", "", { type: "doc" })).rejects.toThrow("changed");
    expect(writes).toBe(0);
    await persistReviewedChapterContent("book-1", "chapter-1", null, { type: "doc" });
    expect(row.content).toBe('{"type":"doc"}');
  });
  it("restores the original bytes when undoing a non-canonical JSON document", async () => {
    const before = '{ "type": "doc", "content": [] }';
    row.content = '{"type":"doc","content":[]}';
    const restored = await persistReviewedChapterContent("book-1", "chapter-1", row.content, before);
    expect(restored).toBe(before);
    expect(row.content).toBe(before);
  });
  it("rejects read errors before a write", async () => {
    readError = { message: "permission denied" };
    await expect(persistReviewedChapterContent("book-1", "chapter-1", "old", { type: "doc" })).rejects.toThrow("Could not read the chapter");
    expect(writes).toBe(0);
  });
  it("rejects write errors without reporting acceptance", async () => {
    writeError = { message: "permission denied" };
    await expect(persistReviewedChapterContent("book-1", "chapter-1", "old", { type: "doc" })).rejects.toThrow("Could not save the review");
    expect(row.content).toBe("old");
  });
});
