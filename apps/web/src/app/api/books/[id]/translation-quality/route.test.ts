import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashTranslationSource, hashTranslationTarget } from "@/lib/translation-quality-report";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), source: vi.fn(), translate: vi.fn(), limit: vi.fn(), queue: vi.fn(), budget: vi.fn(), release: vi.fn(), enabled: vi.fn() }));
vi.mock("@/lib/translation-commit", async (original) => ({ ...await original<object>(), reviewedTranslationActivationReady: () => true }));
vi.mock("@/lib/flags", () => ({ isTranslationsEnabled: mocks.enabled }));
vi.mock("@/lib/workers/budget", async (original) => ({ ...await original<object>(), checkBudget: mocks.budget, releaseBudget: mocks.release }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.client() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/book-translation", async (original) => ({ ...await original<object>(), resolveTranslationSourceContext: mocks.source }));
vi.mock("@/lib/ai/translation-quality/anthropic", () => ({ translateWithQuality: mocks.translate }));
vi.mock("@/lib/translation-queue", () => ({ getTranslationQueue: mocks.queue }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.limit }) }));
// This route now checks the account's master AI switch first. Its own guard
// test covers the blocked path; here the account simply has AI on.
vi.mock("@/features/ai-team/settings/guard", () => ({ aiDisabledResponse: async () => null }));

const { POST, GET } = await import("./route");
const { BudgetExceededError } = await import("@/lib/workers/budget");
const id = "00000000-0000-4000-8000-000000000001";
const sourceId = "00000000-0000-4000-8000-000000000002";
const params = { params: Promise.resolve({ id }) };
let owner: string;
let sourceContent: string;
let writeError: boolean;
let failureWriteThrows: boolean;
let queryFilters: unknown[][];
let savedRows: unknown[];
let writes: Array<Record<string, unknown>>;
const report = { status: "needs_review", profile: { voice: "Spare", rhythm: "Short sentences", dialogue: "Dashes", preserve: [], glossary: [] }, issues: [], revisionCount: 1, reviewRounds: 2, model: "test", rubricVersion: "1", usage: { inputTokens: 1, outputTokens: 2 } };

function request(body: unknown = { targetLanguage: "en", sourceVersionId: sourceId }) {
  return new Request(`http://localhost/api/books/${id}/translation-quality`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks(); owner = "author"; sourceContent = "Hej.\n\nVänta."; writeError = false; failureWriteThrows = false; queryFilters = []; savedRows = []; writes = [];
  mocks.enabled.mockReturnValue(true);
  mocks.auth.mockResolvedValue({ user: { id: "author" }, response: null });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.budget.mockResolvedValue({}); mocks.release.mockResolvedValue(0);
  mocks.source.mockResolvedValue({ sourceVersionId: sourceId, sourceLanguage: "sv" });
  mocks.translate.mockResolvedValue({ translations: ["Hello.\n\nWait."], report });
  mocks.client.mockReturnValue({ from: (table: string) => {
    let writing = false;
    const result = () => ({ data: table === "books" ? { id, author_id: owner } : table === "chapters" ? [{ id: "chapter", title: "One", content: sourceContent, order: 0 }] : savedRows, error: writing && writeError ? { message: "DB unavailable" } : null });
    const chain = {
      select: () => chain, is: () => chain, eq: (...args: unknown[]) => { queryFilters.push(args); return chain; }, in: (...args: unknown[]) => { queryFilters.push(args); return chain; }, order: () => chain, limit: () => chain,
      insert: () => { writing = true; return chain; }, update: (value: Record<string, unknown>) => { writes.push(structuredClone(value)); if (failureWriteThrows) throw new Error("Storage offline"); writing = true; return chain; },
      maybeSingle: async () => result(), then: (resolve: (value: unknown) => void) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  } });
});

describe("scoped queue completion", () => {
  it.each([false, true])("compares saved review fingerprints with the current text (edited: %s)", async (edited) => {
    const snapshot = [{ id: "chapter", title: "One", content: sourceContent, order: 0 }];
    savedRows = [{ id: "review", status: "completed", created_at: "2026-09-14T10:00:00Z", output: {
      formatVersion: 1, scope: "book", sourceVersionId: sourceId, targetVersionId: "target",
      sourceHash: hashTranslationSource(snapshot), targetHash: hashTranslationTarget(snapshot), status: "checks_passed", batches: [],
    } }];
    if (edited) sourceContent = "An edited manuscript.";
    const res = await GET(new Request(`http://localhost/api/books/${id}/translation-quality?scope=book`), params);
    expect((await res.json()).jobs[0].stale).toBe(edited);
  });
  it("reports a completed chapter separately from the book version", async () => {
    mocks.queue.mockReturnValue({ getJob: async () => ({ data: { bookId: id, chapterId: "chapter-1" }, getState: async () => "completed" }) });
    const res = await GET(new Request(`http://localhost/api/books/${id}/translation-quality?queueJobId=job`), params);
    expect(await res.json()).toEqual({ queue: { status: "unverified", chapterId: "chapter-1" } });
  });
  it("does not expose jobs for another book", async () => {
    mocks.queue.mockReturnValue({ getJob: async () => ({ data: { bookId: "other" } }) });
    expect((await GET(new Request(`http://localhost/api/books/${id}/translation-quality?queueJobId=job`), params)).status).toBe(404);
  });
});

describe("translation quality authorization and failure handling", () => {
  it("does not spend on reviews when translation is disabled", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await POST(request(), params)).status).toBe(503);
    expect(mocks.translate).not.toHaveBeenCalled();
    expect(mocks.budget).not.toHaveBeenCalled();
  });

  it("preserves actual usage when a later provider stage fails", async () => {
    const receipt = { stage: "TRANSLATION", model: "test", inputTokens: 19, outputTokens: 7, cacheCreationTokens: 0, cacheReadTokens: 0 };
    mocks.translate.mockImplementation(async ({ onUsage }) => {
      await onUsage(receipt);
      throw new Error("Later review failed");
    });
    expect((await POST(request(), params)).status).toBe(503);
    expect(writes.at(-1)).toMatchObject({ status: "failed", output: { usageReceipts: [receipt], modelStarted: true } });
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("enforces the daily allowance before paying for a sample", async () => {
    mocks.budget.mockRejectedValue(new BudgetExceededError({ userId: "author", pipeline: "translation", day: "2026-09-14", key: "test", current: 500000, limit: 500000, jobId: null }));
    const res = await POST(request(), params);
    expect(res.status).toBe(429); expect(await res.text()).toContain("daily AI allowance");
    expect(mocks.translate).not.toHaveBeenCalled();
  });
  it("reserves separately for each sample and retains spent allowance after a provider failure", async () => {
    await POST(request(), params); await POST(request(), params);
    const calls = mocks.budget.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toMatchObject({ userId: "author", pipeline: "translation", units: expect.any(Number) });
    expect(calls[0][0].jobId).not.toBe(calls[1][0].jobId);
    mocks.translate.mockRejectedValue(new Error("upstream"));
    await POST(request(), params);
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it("forwards auth failures without reading a manuscript", async () => {
    mocks.auth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    expect((await POST(request(), params)).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("rejects another author's book before source/model access", async () => {
    owner = "other";
    expect((await POST(request(), params)).status).toBe(404);
    expect(mocks.translate).not.toHaveBeenCalled(); expect(mocks.source).not.toHaveBeenCalled();
  });
  it("rejects excessive guidance and unsupported languages", async () => {
    expect((await POST(request({ targetLanguage: "en", authorGuidance: "x".repeat(2001) }), params)).status).toBe(400);
    expect((await POST(request({ targetLanguage: "xx" }), params)).status).toBe(400);
    expect(mocks.translate).not.toHaveBeenCalled();
  });
  // CSRF belongs to middleware.ts, which checks Origin against
  // NEXT_PUBLIC_SITE_URL. The copy that used to live in this route compared
  // against new URL(request.url).origin — the origin the server saw — and so
  // 403'd real authors once Railway terminated TLS in front of it. This test
  // passed the whole time, because under vitest those two origins are the same
  // string. Pinned inverted so the broken check does not return.
  it("leaves Origin to the middleware and does not reject on it", async () => {
    const req = request(); req.headers.set("Origin", "https://www.verkli.com");
    expect((await POST(req, params)).status).not.toBe(403);
  });
  it("rate limits before model calls", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    expect((await POST(request(), params)).status).toBe(429);
    expect(mocks.translate).not.toHaveBeenCalled();
  });
  it("rejects a missing or foreign source version", async () => {
    mocks.source.mockResolvedValue({ sourceVersionId: null, sourceLanguage: null });
    expect((await POST(request(), params)).status).toBe(422);
    expect(mocks.translate).not.toHaveBeenCalled();
  });
  it("uses stored current content, preserving paragraphs, and passes the requested source version", async () => {
    const res = await POST(request(), params); const body = await res.json();
    expect(res.status).toBe(200); expect(body.report.status).toBe("needs_review");
    expect(body.originalText).toBe(sourceContent);
    expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({ requestedSourceVersionId: sourceId }));
    expect(mocks.translate).toHaveBeenCalledWith(expect.objectContaining({ texts: [sourceContent], sourceLanguage: "sv", targetLanguage: "en" }));
    expect(queryFilters).toContainEqual(["book_version_id", sourceId]);
  });
  it("does not claim a saved review when persistence fails", async () => {
    writeError = true;
    expect((await POST(request(), params)).status).toBe(503);
  });
  it("returns a safe failure, not a pass or provider response body", async () => {
    mocks.translate.mockRejectedValue(new Error("private upstream text"));
    const res = await POST(request(), params); expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("private upstream text");
  });
  it("keeps the safe model failure when failure-status storage throws", async () => {
    failureWriteThrows = true;
    mocks.translate.mockRejectedValue(new Error("private upstream text"));
    const res = await POST(request(), params);
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("No quality decision was made");
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it("does not send empty chapters to the model", async () => {
    sourceContent = "";
    expect((await POST(request(), params)).status).toBe(422); expect(mocks.translate).not.toHaveBeenCalled();
  });
  it("does not trust a legacy completed queue entry carrying a worker-minted ID", async () => {
    mocks.queue.mockReturnValue({ getJob: async () => ({ data: { bookId: id, reviewedRunId: "legacy" }, getState: async () => "completed" }) });
    const res = await GET(new Request(`http://localhost/api/books/${id}/translation-quality?queueJobId=legacy`), params);
    expect(await res.json()).toEqual({ queue: { status: "unverified", chapterId: null } });
    expect(queryFilters).not.toContainEqual(["id", "legacy"]);
  });
  it.each(["failed", "processing", "absent", "unavailable", "completed"])("uses the durable %s outcome even when the queue reports failure", async (outcome) => {
    const runId = "00000000-0000-4000-8000-000000000010";
    const receipt = { jobId: runId, versionId: "target", updatedAt: "2026-09-18T00:00:00Z", savedChapters: 1, replayed: false };
    const run = outcome === "absent" || outcome === "unavailable" ? null : { id: runId, book_version_id: "target", status: outcome,
      output: { status: outcome === "completed" ? "checks_passed" : outcome, error: "This translation is published.", _translationCommit: { receipt } } };
    mocks.client.mockReturnValue({ from: (table: string) => {
      const query = { select: () => query, eq: () => query, is: () => query,
        maybeSingle: async () => ({ data: table === "books" ? { id, author_id: "author" } : run, error: table !== "books" && outcome === "unavailable" ? { message: "offline" } : null }) };
      return query;
    } });
    mocks.queue.mockReturnValue({ getJob: async () => ({ id: "book-en", timestamp: 123, failedReason: "This translation is published.",
      data: { bookId: id, sourceVersionId: sourceId, reviewedRunId: runId, reviewedQueueProtocol: "reviewed-atomic-v2" }, getState: async () => "failed" }) });
    const res = await GET(new Request(`http://localhost/api/books/${id}/translation-quality?queueJobId=book-en`), params);
    expect(await res.json()).toEqual({ queue: { status: outcome === "failed" || outcome === "completed" ? outcome : "pending", chapterId: null } });
  });
  it("filters saved reports by authenticated owner and book", async () => {
    const res = await GET(new Request(`http://localhost/api/books/${id}/translation-quality?targetLanguage=en&scope=book`), params);
    expect(res.status).toBe(200); expect(queryFilters).toContainEqual(["user_id", "author"]); expect(queryFilters).toContainEqual(["book_id", id]);
    expect(queryFilters).toContainEqual(["input->>scope", ["book", "chapter"]]);
  });
});
