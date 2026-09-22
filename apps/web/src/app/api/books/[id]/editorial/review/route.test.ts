import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ gate: vi.fn(), db: vi.fn(), generate: vi.fn(), check: vi.fn(), enabled: vi.fn(), budget: vi.fn(), release: vi.fn(), insert: vi.fn(), receipt: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.gate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.db }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.check }) }));
vi.mock("@/lib/editorial/provider", () => ({ generateEditorialReview: mocks.generate, estimateEditorialUnits: () => 20000, EDITORIAL_MODEL: "claude-sonnet-5" }));
vi.mock("@/lib/flags", () => ({ isAiChatEnabled: mocks.enabled }));
vi.mock("@/lib/workers/budget", () => ({ checkBudget: mocks.budget, releaseBudget: mocks.release, BudgetExceededError: class extends Error {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ insert: mocks.insert, update: (patch: unknown) => { mocks.receipt(patch); const chain = { eq: () => chain, select: () => chain, maybeSingle: async () => ({ data: { id: "job" }, error: null }) }; return chain; } }) }) }));
// This route now checks the account's master AI switch first. Its own guard
// test covers the blocked path; here the account simply has AI on.
vi.mock("@/features/ai-team/settings/guard", () => ({ aiDisabledResponse: async () => null }));
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
beforeEach(() => { vi.clearAllMocks(); mocks.gate.mockResolvedValue({ user: { id: "author" } }); mocks.check.mockResolvedValue({ allowed: true }); mocks.enabled.mockReturnValue(true); mocks.budget.mockResolvedValue({ limit: 40000, current: 20000 }); mocks.insert.mockResolvedValue({ error: null });
  vi.stubEnv("EDITORIAL_DAILY_BUDGET", "40000"); vi.stubEnv("ANTHROPIC_API_KEY", "test");
  mocks.generate.mockImplementation(async (_input, onUsage) => { await onUsage({ model: "claude-sonnet-5", inputTokens: 15, outputTokens: 20, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }); return report; }); setup(); });
afterEach(() => vi.unstubAllEnvs());
describe("editorial review API", () => {
  it("reads saved chapter text, returns exact baseline, and scopes the chapter to the owned book", async () => {
    const filters = setup(); const response = await run();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ originalContent: chapter.content, partCount: 1, reviewedText: "She walk home." });
    expect(filters[1]).toContainEqual(["book_id", bookId]);
    expect(filters[1]).toContainEqual(["id", chapterId]);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ text: "She walk home." }), expect.any(Function));
  });
  it("never starts a provider when the AI switch is off", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await run()).status).toBe(503);
    expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.budget).not.toHaveBeenCalled();
  });
  it("requires an explicit editorial cap before any model work", async () => {
    vi.stubEnv("EDITORIAL_DAILY_BUDGET", "");
    expect((await run()).status).toBe(503);
    expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.budget).not.toHaveBeenCalled();
  });
  it("reserves before generation and stores the actual token receipt", async () => {
    expect((await run()).status).toBe(200);
    expect(mocks.budget.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
    expect(mocks.budget).toHaveBeenCalledWith(expect.objectContaining({ pipeline: "editorial", userId: "author", units: 20000 }));
    expect(mocks.receipt).toHaveBeenCalledWith(expect.objectContaining({ output: expect.objectContaining({ usage: expect.objectContaining({ inputTokens: 15, outputTokens: 20 }) }) }));
  });
  it("fails closed on budget storage failure", async () => {
    mocks.budget.mockRejectedValue(new Error("Redis unavailable"));
    expect((await run()).status).toBe(503);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("refunds a failed ledger insert before model work but never a provider attempt", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "storage" } });
    expect((await run()).status).toBe(503);
    expect(mocks.release).toHaveBeenCalledOnce(); expect(mocks.generate).not.toHaveBeenCalled();
    mocks.release.mockClear(); mocks.insert.mockResolvedValue({ error: null }); setup();
    mocks.generate.mockRejectedValue(new Error("provider failed"));
    expect((await run()).status).toBe(502);
    expect(mocks.release).not.toHaveBeenCalled();
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
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ sourceText: "Hon går hem.", text: "She walk home." }), expect.any(Function));
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
