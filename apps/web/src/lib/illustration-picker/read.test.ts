import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { readPicker } from "./read";
import { candidatePage, pickerQuerySchema } from "@/features/illustration-picker/contracts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function setup(results: unknown[]) {
  const calls: unknown[][] = [];
  const chain = { select(...args: unknown[]) { calls.push(["select", ...args]); return chain; }, eq(...args: unknown[]) { calls.push(["eq", ...args]); return chain; }, is(...args: unknown[]) { calls.push(["is", ...args]); return chain; }, ilike(...args: unknown[]) { calls.push(["ilike", ...args]); return chain; }, order(...args: unknown[]) { calls.push(["order", ...args]); return chain; }, range(...args: unknown[]) { calls.push(["range", ...args]); return chain; }, maybeSingle() { return Promise.resolve(results.shift()); }, then(resolve: (result: unknown) => unknown) { return Promise.resolve(results.shift()).then(resolve); } };
  const client = { from: vi.fn((table: string) => { calls.push(["from", table]); return chain; }) } as unknown as SupabaseClient<Database>;
  return { client, calls };
}
const book = { id: id(1), title: "The harbour", author_id: id(9), deleted_at: null };
const edition = { id: id(2), book_id: id(1), language_code: "sv", created_at: "2026-09-23T10:00:00Z" };
it.each([{ book: "bad" }, { edition: id(2) }, { page: "-1" }, { page: "10001" }, { q: ["duplicate"] }])("rejects invalid query %#", (query) => { expect(pickerQuerySchema.safeParse(query).success).toBe(false); });
it("bounds and owner-filters searchable books with visible pagination", async () => {
  const f = setup([{ data: Array.from({ length: 21 }, (_, i) => ({ ...book, id: id(i + 10) })) }]);
  const result = await readPicker(f.client, id(9), pickerQuerySchema.parse({ q: "50%_boat", page: "1" }));
  expect(result.stage).toBe("books"); expect(result.items).toHaveLength(20); expect(result.hasNext).toBe(true);
  expect(f.calls).toContainEqual(["eq", "author_id", id(9)]); expect(f.calls).toContainEqual(["is", "deleted_at", null]);
  expect(f.calls).toContainEqual(["range", 20, 40]); expect(f.calls).toContainEqual(["ilike", "title", "%50\\%\\_boat%"]);
});
it.each([{ ...book, author_id: id(8) }, { ...book, deleted_at: "deleted" }, null])("denies foreign/deleted/missing selected book %# before reading editions", async (row) => {
  const f = setup([{ data: row }]);
  await expect(readPicker(f.client, id(9), pickerQuerySchema.parse({ book: id(1) }))).rejects.toMatchObject({ status: 404 });
  expect(f.calls.filter((call) => call[0] === "from")).toEqual([["from", "books"]]);
});
it("lists only editions of the selected owned book", async () => {
  const f = setup([{ data: book }, { data: [edition] }]);
  const result = await readPicker(f.client, id(9), pickerQuerySchema.parse({ book: id(1) }));
  expect(result.stage).toBe("editions"); expect(result.items[0]).toMatchObject({ id: id(2), title: "SV" });
  expect(result.items[0].detail).toContain("10:00:00");
  expect(f.calls).toContainEqual(["eq", "book_id", id(1)]);
});
it("denies an edition from another book before a chapter query", async () => {
  const f = setup([{ data: book }, { data: { ...edition, book_id: id(8) } }]);
  await expect(readPicker(f.client, id(9), pickerQuerySchema.parse({ book: id(1), edition: id(2) }))).rejects.toMatchObject({ status: 404 });
  expect(f.calls.filter((call) => call[0] === "from")).toEqual([["from", "books"], ["from", "book_versions"]]);
});
it("reads only active chapter metadata in the verified edition", async () => {
  const f = setup([{ data: book }, { data: edition }, { data: [{ id: id(3), book_id: id(1), book_version_id: id(2), title: "Dawn", order: 0, deleted_at: null }] }]);
  const result = await readPicker(f.client, id(9), pickerQuerySchema.parse({ book: id(1), edition: id(2) }));
  expect(result.stage).toBe("chapters"); expect(result.items[0].title).toBe("Dawn");
  expect(f.calls).toContainEqual(["eq", "book_version_id", id(2)]);
  expect(f.calls.filter((call) => call[0] === "select").some((call) => String(call[1]).includes("content"))).toBe(false);
  expect(candidatePage(id(1), id(2), id(3))).toBe(`/author/books/${id(1)}/editions/${id(2)}/chapters/${id(3)}/illustrations`);
});
it("reports read failures instead of an empty library", async () => {
  const f = setup([{ error: { message: "private database details" } }]);
  await expect(readPicker(f.client, id(9), pickerQuerySchema.parse({}))).rejects.toMatchObject({ status: 503 });
});
