import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ gate: vi.fn(), from: vi.fn(), filters: [] as unknown[][], writeFilters: [] as unknown[][], writes: [] as unknown[], readError: false, writeError: false, changed: false, bookOwned: true, stored: null as unknown, draftRows: [] as unknown[] }));
vi.mock("@/lib/auth/require-author-marketing", () => ({ requireAuthorAndMarketingEnabled: m.gate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: m.from }) }));
const { GET, POST } = await import("./route");
const { PATCH } = await import("./[id]/route");
const bookId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const revision = "2026-09-23T10:00:00Z";
const draft = { name: "Ocean", channel: "Chosen placement", objective: "Visits", audience: "Readers", headline: "Ocean", copy: "A sea journey.", destinationUrl: "https://example.com/book", currency: "SEK", totalBudget: "100", dailyBudget: null, startDate: "2026-09-01", endDate: "2026-09-07" };
const row = { id, book_id: bookId, updated_at: revision, paid_config: { kind: "ad_draft", version: 1, draft } };
const request = (body: unknown, method = "POST") => new Request("https://example.com/api/author/marketing/ad-drafts", { method, body: JSON.stringify(body) });
const patch = (body: unknown) => PATCH(request(body, "PATCH"), { params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.clearAllMocks(); Object.assign(m, { filters: [], writeFilters: [], writes: [], readError: false, writeError: false, changed: false, bookOwned: true, stored: row, draftRows: [row] });
  m.gate.mockResolvedValue({ user: { id: "author" }, response: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.from.mockImplementation((table: string) => {
    let writing = false;
    const result = (single: boolean) => ({
      data: table === "books" ? (single ? m.bookOwned ? { id: bookId, title: "Ocean" } : null : [{ id: bookId, title: "Ocean" }]) : single ? m.changed && writing ? null : m.stored : m.draftRows,
      error: (writing ? m.writeError : m.readError) ? { code: "08006" } : null,
    });
    const q = {
      select: () => q, order: () => q, range: () => q,
      eq: (key: string, value: unknown) => { m.filters.push([key, value]); if (writing) m.writeFilters.push([key, value]); return q; },
      insert: (value: unknown) => { writing = true; m.writes.push(value); return q; },
      update: (value: unknown) => { writing = true; m.writes.push(value); return q; },
      maybeSingle: async () => result(true), single: async () => result(true),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result(false)).then(resolve),
    }; return q;
  });
});
afterEach(() => vi.restoreAllMocks());
it("keeps author/feature denial before database access", async () => {
  m.gate.mockResolvedValue({ user: null, response: new Response(null, { status: 403 }) });
  expect((await POST(request({ bookId, draft }))).status).toBe(403);
  expect((await patch({ expectedUpdatedAt: revision, draft })).status).toBe(403);
  expect((await GET()).status).toBe(403); expect(m.from).not.toHaveBeenCalled();
});
it("creates only a paused planning draft with no runnable channels or schedule", async () => {
  expect((await POST(request({ bookId, draft }))).status).toBe(201);
  expect(m.writes).toEqual([expect.objectContaining({ author_id: "author", book_id: bookId, status: "paused", mode: "paid", channels: [], weekly_schedule: {}, paid_config: row.paid_config })]);
  expect(m.filters).toContainEqual(["author_id", "author"]);
});
it("rejects another owner's book and invalid input before saving", async () => {
  m.bookOwned = false; expect((await POST(request({ bookId, draft }))).status).toBe(404);
  expect((await POST(request({ bookId, draft: { ...draft, totalBudget: "0" } }))).status).toBe(400);
  expect(m.writes).toEqual([]);
});
it("does not turn failed reads or writes into empty/saved success", async () => {
  m.readError = true; expect((await GET()).status).toBe(500);
  m.readError = false; m.writeError = true; expect((await POST(request({ bookId, draft }))).status).toBe(500);
});
it("lists only owned ad drafts and strips storage metadata", async () => {
  const response = await GET(); expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ books: [{ id: bookId, title: "Ocean" }], drafts: [{ id, bookId, updatedAt: revision, draft }] });
  expect(m.filters).toContainEqual(["paid_config->>kind", "ad_draft"]);
  expect(m.filters).toContainEqual(["mode", "paid"]);
});
it("uses owner, kind, mode, paused state and expected revision to save atomically", async () => {
  expect((await patch({ expectedUpdatedAt: revision, draft })).status).toBe(200);
  for (const filter of [["id", id], ["author_id", "author"], ["book_id", bookId], ["updated_at", revision], ["mode", "paid"], ["status", "paused"], ["paid_config->>kind", "ad_draft"], ["paid_config->>version", "1"]]) expect(m.writeFilters).toContainEqual(filter);
});
it("returns conflict if the row changed instead of claiming the draft was saved", async () => {
  m.changed = true; expect((await patch({ expectedUpdatedAt: revision, draft })).status).toBe(409);
});
it("does not overwrite a malformed or unknown version of a stored draft", async () => {
  m.stored = { ...row, paid_config: { kind: "ad_draft", version: 999, draft } };
  expect((await patch({ expectedUpdatedAt: revision, draft })).status).toBe(409); expect(m.writes).toEqual([]);
});
it("rejects a saved draft after its book is no longer owned", async () => {
  m.bookOwned = false;
  expect((await patch({ expectedUpdatedAt: revision, draft })).status).toBe(404);
  expect(m.writes).toEqual([]);
});
it("does not expose drafts for books missing from the owned list", async () => {
  m.draftRows = [{ ...row, book_id: "33333333-3333-4333-8333-333333333333" }];
  expect((await (await GET()).json()).drafts).toEqual([]);
});
it("reports an unreadable draft rather than silently returning an empty list", async () => {
  m.draftRows = [{ ...row, paid_config: { kind: "ad_draft", version: 999 } }];
  expect((await GET()).status).toBe(500);
});
it("preserves failed update semantics and hides database details", async () => {
  m.writeError = true;
  const response = await patch({ expectedUpdatedAt: revision, draft });
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("08006");
});
