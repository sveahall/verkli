import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { createCandidatePorts } from "./repository";
const key = { bookId: "book", editionId: "edition", chapterId: "chapter" };
function database(results: unknown[]) {
  const calls: unknown[][] = [];
  const chain = {
    select(...args: unknown[]) { calls.push(["select", ...args]); return chain; },
    eq(...args: unknown[]) { calls.push(["eq", ...args]); return chain; },
    is(...args: unknown[]) { calls.push(["is", ...args]); return chain; },
    limit(...args: unknown[]) { calls.push(["limit", ...args]); return chain; },
    order(...args: unknown[]) { calls.push(["order", ...args]); return chain; },
    maybeSingle() { return Promise.resolve(results.shift()); },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(results.shift()).then(resolve); },
  };
  return { calls, from: vi.fn((table) => { calls.push(["from", table]); return chain; }), storage: { getBucket: vi.fn() } };
}
beforeEach(() => vi.resetAllMocks());
it("checks actual owner and both relational links before allowing storage", async () => {
  const db = database([{ data: { id: "book", author_id: "owner", deleted_at: null } }, { data: { id: "edition", book_id: "book" } }, { data: { id: "chapter", book_id: "book", book_version_id: "edition", deleted_at: null, version_number: 4, title: "Sea" } }]);
  mocks.client.mockResolvedValue(db);
  const ports = await createCandidatePorts();
  await expect(ports.authorize("owner", key)).resolves.toMatchObject({ chapterVersion: 4 });
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(db.calls).toContainEqual(["eq", "author_id", "owner"]); expect(db.calls).toContainEqual(["eq", "book_version_id", "edition"]);
  expect(db.calls.filter((call) => call[0] === "is")).toEqual([["is", "deleted_at", null], ["is", "deleted_at", null]]);
});
it.each([
  [{ data: { id: "book", author_id: "other", deleted_at: null } }],
  [{ data: { id: "book", author_id: "owner", deleted_at: "deleted" } }],
  [{ data: { id: "book", author_id: "owner" } }, { data: { id: "edition", book_id: "other" } }],
  [{ data: { id: "book", author_id: "owner" } }, { data: { id: "edition", book_id: "book" } }, { data: { id: "chapter", book_id: "book", book_version_id: "other" } }],
])("does not trust returned rows with mismatched scope %#", async (...results) => {
  mocks.client.mockResolvedValue(database(results)); const ports = await createCandidatePorts();
  await expect(ports.authorize("owner", key)).resolves.toBeNull(); expect(mocks.admin).not.toHaveBeenCalled();
});
it.each([true, undefined, false])("accepts only an explicitly private bucket (%s)", async (publicValue) => {
  const db = database([{ data: [] }]); db.storage.getBucket.mockResolvedValue({ data: { id: "content-assets", public: publicValue } });
  mocks.client.mockResolvedValue({}); mocks.admin.mockReturnValue(db);
  expect(await (await createCandidatePorts()).ready()).toBe(publicValue === false);
  expect(db.calls).toContainEqual(["limit", 0]);
});
it("fails readiness before storage if required columns are missing", async () => {
  const db = database([{ error: { code: "42703" } }]); mocks.client.mockResolvedValue({}); mocks.admin.mockReturnValue(db);
  expect(await (await createCandidatePorts()).ready()).toBe(false); expect(db.storage.getBucket).not.toHaveBeenCalled();
});
