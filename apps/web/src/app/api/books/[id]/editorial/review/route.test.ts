import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ gate: vi.fn(), db: vi.fn(), generate: vi.fn(), check: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.gate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.db }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.check }) }));
vi.mock("@/lib/editorial/provider", () => ({ generateEditorialReview: mocks.generate }));
import { POST } from "./route";
const bookId = "11111111-1111-4111-8111-111111111111";
const chapterId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const sourceVersionId = "44444444-4444-4444-8444-444444444444";
const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const chapter = { id: chapterId, title: "Opening", content: doc("She walk home."), order: 2, book_version_id: versionId };
const report = { summary: "Grammar issue.", findings: [], corrections: [] };
function setup(rows: unknown[] = [{ id: bookId, author_id: "author" }, chapter]) {
  const filters: [string, unknown][][] = [];
  mocks.db.mockResolvedValue({ from: () => {
    const current: [string, unknown][] = []; filters.push(current);
    const chain = { select: () => chain, eq: (key: string, value: unknown) => { current.push([key, value]); return chain; }, maybeSingle: async () => ({ data: rows.shift() ?? null, error: null }) };
    return chain;
  } });
  return filters;
}
const run = (body: Record<string, unknown> = {}) => POST(new NextRequest(`http://localhost/api/books/${bookId}/editorial/review`, { method: "POST", body: JSON.stringify({ mode: "proofread", chapterId, ...body }) }), { params: Promise.resolve({ id: bookId }) });
beforeEach(() => { vi.clearAllMocks(); mocks.gate.mockResolvedValue({ user: { id: "author" } }); mocks.check.mockResolvedValue({ allowed: true }); mocks.generate.mockResolvedValue(report); setup(); });
describe("editorial review API", () => {
  it("reads saved chapter text, returns exact baseline, and scopes the chapter to the owned book", async () => {
    const filters = setup(); const response = await run();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ originalContent: chapter.content, partCount: 1, reviewedText: "She walk home." });
    expect(filters[1]).toContainEqual(["book_id", bookId]);
    expect(filters[1]).toContainEqual(["id", chapterId]);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ text: "She walk home." }));
  });
  it("preserves the auth gate", async () => {
    mocks.gate.mockResolvedValue({ response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await run()).status).toBe(401); expect(mocks.db).not.toHaveBeenCalled();
  });
  it("does not send another author's manuscript to AI", async () => {
    setup([{ id: bookId, author_id: "other" }, chapter]);
    expect((await run()).status).toBe(403); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("refuses missing chapters rather than reviewing without context", async () => {
    setup([{ id: bookId, author_id: "author" }, null]);
    expect((await run()).status).toBe(404); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("exposes all parts of long chapters without silent truncation", async () => {
    setup([{ id: bookId, author_id: "author" }, { ...chapter, content: doc("a".repeat(13000)) }]);
    const response = await run({ part: 1 });
    expect(await response.json()).toMatchObject({ part: 1, partCount: 2, reviewedText: "a".repeat(1000) });
  });
  it("matches source chapters by book, selected version and position", async () => {
    const filters = setup([{ id: bookId, author_id: "author" }, chapter, { content: doc("Hon går hem.") }]);
    expect((await run({ mode: "translation", sourceVersionId })).status).toBe(200);
    expect(filters[2]).toEqual([["book_id", bookId], ["book_version_id", sourceVersionId], ["order", 2]]);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ sourceText: "Hon går hem.", text: "She walk home." }));
  });
  it("refuses source=target and missing source versions", async () => {
    expect((await run({ mode: "translation", sourceVersionId: versionId })).status).toBe(400);
    setup(); expect((await run({ mode: "translation" })).status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("refuses an oversized translation pair instead of reporting a partial review as complete", async () => {
    setup([{ id: bookId, author_id: "author" }, chapter, { content: doc("a".repeat(80000)) }]);
    expect((await run({ mode: "translation", sourceVersionId })).status).toBe(422);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("returns provider failure without fabricated results", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try { mocks.generate.mockRejectedValue(new Error("provider error")); expect((await run()).status).toBe(502); } finally { log.mockRestore(); }
  });
  it("enforces rate limiting before reading manuscripts", async () => {
    mocks.check.mockResolvedValue({ allowed: false }); expect((await run()).status).toBe(429); expect(mocks.db).not.toHaveBeenCalled();
  });
});
