import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { BOOK_ANALYSIS_CATEGORIES, type AnalysisNote, type BookAnalysisReport } from "@/lib/editorial/book-analysis-schema";
import { analysisManifestSchema, analysisRunSchema, type BookAnalysisResult } from "@/lib/editorial/book-analysis-run-schema";
import { splitBookAnalysis, type BookAnalysisPart } from "@/lib/editorial/book-analysis-content";
import { reviewText } from "@/lib/editorial/content";
import type { EditorialUsage } from "@/lib/editorial/provider";
const mocks = vi.hoisted(() => ({ gate: vi.fn(), db: vi.fn(), admin: vi.fn(), notes: vi.fn(), report: vi.fn(), estimateNotes: vi.fn(), estimateReport: vi.fn(), check: vi.fn(), enabled: vi.fn(), budget: vi.fn(), release: vi.fn(), requireAiEnabled: vi.fn() }));
vi.mock("@/features/ai-team/settings/server", async (original) => ({
  ...(await original<typeof import("@/features/ai-team/settings/server")>()),
  requireAiEnabled: mocks.requireAiEnabled,
}));
import { AiSettingsError } from "@/features/ai-team/settings/server";
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.gate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.db }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.check }) }));
vi.mock("@/lib/flags", () => ({ isAiChatEnabled: mocks.enabled }));
vi.mock("@/lib/editorial/book-analysis-provider", () => ({ generateBookAnalysisNotes: mocks.notes, generateBookAnalysisReport: mocks.report, estimateBookAnalysisNotesUnits: mocks.estimateNotes, estimateBookAnalysisReportUnits: mocks.estimateReport }));
vi.mock("@/lib/workers/budget", () => ({ checkBudget: mocks.budget, releaseBudget: mocks.release, BudgetExceededError: class extends Error {} }));
// This route now checks the account's master AI switch first. Its own guard
// test covers the blocked path; here the account simply has AI on.
vi.mock("@/features/ai-team/settings/guard", () => ({ aiDisabledResponse: async () => null }));
import { BudgetExceededError } from "@/lib/workers/budget";
import { GET, POST } from "./route";

const bookId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const authorId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const chapterId = (index: number) => `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`;
const usage: EditorialUsage = { model: "claude-sonnet-5", inputTokens: 20, outputTokens: 30, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
const report: BookAnalysisReport = { summary: "No cross-chapter issue identified from extracted notes; this is not a complete consistency guarantee.", areas: BOOK_ANALYSIS_CATEGORIES.map((category) => ({ category, summary: "Available evidence reviewed." })), findings: [] };
const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
type Row = Record<string, unknown>;
type Filter = [string, unknown];
type DbResult = { data: Row | Row[] | null; error: { message: string } | null };
type QueryRecord = { table: string; operation: "read" | "insert" | "update"; patch: Row | null; filters: Filter[] };
let tables: Record<string, Row[]>;
let history: QueryRecord[];
let failReceipt: number;
let ambiguousSave: "pending" | "completed" | null;
let throwAfterPartSave: boolean;
let beforeClaim: (() => void) | null;
const clone = <T,>(value: T): T => structuredClone(value);

/** Applies filters and writes against shared rows, with cloned read snapshots as
 * PostgREST would return. This makes competing requests exercise the real CAS. */
class Query implements PromiseLike<DbResult> {
  private filters: Filter[] = [];
  private sorting: { key: string; ascending: boolean }[] = [];
  private selected = "*";
  private maximum = Infinity;
  private operation: QueryRecord["operation"] = "read";
  private patch: Row | null = null;
  private single = false;
  constructor(private table: string) {}
  select(columns = "*") { this.selected = columns; return this; }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
  is(key: string, value: unknown) { return this.eq(key, value); }
  order(key: string, options?: { ascending?: boolean }) { this.sorting.push({ key, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.maximum = value; return this; }
  insert(patch: Row) { this.operation = "insert"; this.patch = patch; return this; }
  update(patch: Row) { this.operation = "update"; this.patch = patch; return this; }
  maybeSingle() { this.single = true; return this.execute(); }
  then<TResult1 = DbResult, TResult2 = never>(fulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null, rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(fulfilled, rejected);
  }
  private async execute(): Promise<DbResult> {
    history.push(clone({ table: this.table, operation: this.operation, patch: this.patch, filters: this.filters }));
    if (this.table === "ai_jobs" && this.operation === "update" && this.patch?.status === "processing" && beforeClaim) {
      const race = beforeClaim; beforeClaim = null; race();
    }
    if (this.table === "ai_jobs" && this.operation === "update" && this.patch?.output && !this.patch.status && failReceipt > 0) {
      failReceipt -= 1;
      return { data: null, error: { message: "Receipt storage unavailable" } };
    }
    let rows = tables[this.table] ?? [];
    if (this.operation === "insert") {
      const row = { created_at: "2026-09-17T12:00:00.000Z", error: null, ...clone(this.patch) };
      rows.push(row); tables[this.table] = rows; rows = [row];
    } else {
      rows = rows.filter((row) => this.filters.every(([key, value]) => {
        if (key === "output->>completedParts") return String((row.output as Row)?.completedParts) === value;
        return row[key] === value;
      }));
      if (this.operation === "update") rows.forEach((row) => Object.assign(row, clone(this.patch)));
    }
    if (this.operation === "update" && ambiguousSave && this.patch?.status === ambiguousSave) {
      ambiguousSave = null;
      return { data: null, error: { message: "Connection interrupted after commit" } };
    }
    if (this.operation === "update" && this.patch?.status === "pending" && throwAfterPartSave) {
      throwAfterPartSave = false;
      // A subsequent request can claim the committed part before the earlier
      // connection rejects. The earlier catch must not overwrite its work.
      rows.forEach((row) => { row.status = "processing"; });
      throw new Error("Transport rejected after commit");
    }
    rows = [...rows].sort((left, right) => {
      for (const sort of this.sorting) {
        const a = left[sort.key] as number | string;
        const b = right[sort.key] as number | string;
        if (a < b) return sort.ascending ? -1 : 1;
        if (a > b) return sort.ascending ? 1 : -1;
      }
      return 0;
    }).slice(0, this.maximum);
    const projected = rows.map((row) => this.selected === "*" ? row : Object.fromEntries(this.selected.split(",").map((key) => [key, row[key]])));
    return { data: clone(this.single ? projected[0] ?? null : projected), error: null };
  }
}
function makeChapter(index: number, text: string): Row {
  return { id: chapterId(index), book_id: bookId, book_version_id: versionId, title: `Chapter ${index + 1}`, content: doc(text), order: index, updated_at: "2026-09-17T10:00:00.000Z", version_number: 1, deleted_at: null };
}
function inputChapters() {
  return tables.chapters.filter((chapter) => chapter.deleted_at === null && chapter.book_id === bookId && chapter.book_version_id === versionId).map((chapter) => ({ id: chapter.id as string, title: chapter.title as string, order: chapter.order as number, text: reviewText(chapter.content as string) }));
}
function post(body: Row, id = bookId, origin?: string) {
  return POST(new NextRequest(`http://localhost/api/books/${id}/editorial/book-analysis`, { method: "POST", body: JSON.stringify({ versionId, ...body }), headers: origin ? { origin } : undefined }), { params: Promise.resolve({ id }) });
}
function get(id = bookId, edition = versionId) {
  return GET(new NextRequest(`http://localhost/api/books/${id}/editorial/book-analysis?versionId=${edition}`), { params: Promise.resolve({ id }) });
}
async function start() {
  const response = await post({ action: "start" });
  expect(response.status).toBe(200);
  const body = await response.json() as { analysis: BookAnalysisResult };
  return body.analysis;
}
const advance = (jobId: string, expectedPart: number) => post({ action: "advance", jobId, expectedPart });
const savedRun = () => analysisRunSchema.parse(tables.ai_jobs[0].output);
async function finishParts(jobId: string, count: number) {
  for (let step = 0; step < count; step += 1) expect((await advance(jobId, step)).status).toBe(200);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAiEnabled.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
  tables = { books: [{ id: bookId, author_id: authorId, deleted_at: null }], book_versions: [{ id: versionId, book_id: bookId }], chapters: [makeChapter(0, "a".repeat(11999) + "🦋This entire chapter is split safely."), makeChapter(1, "On Tuesday Ada arrived."), makeChapter(2, "On Wednesday Ada left.")], ai_jobs: [] };
  history = []; failReceipt = 0; ambiguousSave = null; throwAfterPartSave = false; beforeClaim = null;
  const db = { from: (table: string) => new Query(table) };
  mocks.db.mockResolvedValue(db); mocks.admin.mockReturnValue(db);
  mocks.gate.mockResolvedValue({ user: { id: authorId } }); mocks.check.mockResolvedValue({ allowed: true }); mocks.enabled.mockReturnValue(true);
  mocks.budget.mockResolvedValue({ limit: 1000000, current: 20000 }); mocks.release.mockResolvedValue(20000);
  mocks.estimateNotes.mockReturnValue(20000); mocks.estimateReport.mockReturnValue(30000);
  mocks.notes.mockImplementation(async (part: BookAnalysisPart, onUsage: (value: EditorialUsage) => Promise<void>): Promise<AnalysisNote[]> => {
    await onUsage(usage);
    return [{ category: "plot", observation: "A source passage to compare.", evidence: [{ chapterId: part.chapterId, quote: part.text.slice(0, 100) }] }];
  });
  mocks.report.mockImplementation(async (_chapters, _notes, onUsage: (value: EditorialUsage) => Promise<void>) => { await onUsage(usage); return report; });
  vi.stubEnv("EDITORIAL_DAILY_BUDGET", "1000000"); vi.stubEnv("ANTHROPIC_API_KEY", "test");
  vi.stubEnv("WHOLE_BOOK_ANALYSIS_ENABLED", "true");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("whole-book analysis API", () => {
  it.each([
    ["AI_DISABLED", 403, "AI is turned off for your account."],
    ["AI_SETTINGS_UNAVAILABLE", 503, "Your AI settings could not be read."],
  ] as const)("blocks start and advance for %s without spending or changing jobs", async (code, status, message) => {
    const analysis = await start();
    const jobs = clone(tables.ai_jobs);
    mocks.requireAiEnabled.mockRejectedValue(new AiSettingsError(code, status, message));

    for (const body of [{ action: "start" }, { action: "advance", jobId: analysis.jobId, expectedPart: 0 }]) {
      const result = await post(body);
      expect(result.status).toBe(status);
      expect(await result.json()).toMatchObject({ error: message });
    }
    expect(mocks.requireAiEnabled).toHaveBeenCalledWith(expect.anything(), authorId);
    expect(tables.ai_jobs).toEqual(jobs);
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(mocks.notes).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("keeps saved analysis readable and lets the author stop work with account AI off", async () => {
    const analysis = await start();
    mocks.requireAiEnabled.mockRejectedValue(new AiSettingsError("AI_DISABLED", 403, "AI is turned off for your account."));

    const loaded = await get();
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toMatchObject({ analysis: { jobId: analysis.jobId }, available: false, unavailableReason: "AI is turned off for your account." });
    const calls = mocks.requireAiEnabled.mock.calls.length;
    expect((await post({ action: "abandon", jobId: analysis.jobId })).status).toBe(200);
    expect(mocks.requireAiEnabled).toHaveBeenCalledTimes(calls);
    expect(tables.ai_jobs[0].status).toBe("failed");
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(mocks.notes).not.toHaveBeenCalled();
  });

  it("starts without spend, extracts every complete chapter part, then saves one synthesis and receipts", async () => {
    const analysis = await start();
    expect(analysis).toMatchObject({ status: "pending", completedParts: 0, totalParts: 4, stale: false, report: null });
    expect(mocks.budget).not.toHaveBeenCalled(); expect(mocks.notes).not.toHaveBeenCalled();
    const manifest = analysisManifestSchema.parse(tables.ai_jobs[0].input);
    expect(manifest.chapters).toHaveLength(3);
    await finishParts(analysis.jobId, analysis.totalParts);
    const expectedParts = splitBookAnalysis(inputChapters());
    expect(mocks.notes.mock.calls.map(([part]) => part)).toEqual(expectedParts);
    expect(savedRun().completedParts).toBe(4); expect(savedRun().report).toBeNull();
    const completed = await advance(analysis.jobId, analysis.totalParts);
    expect(completed.status).toBe(200);
    expect(await completed.json()).toMatchObject({ analysis: { status: "completed", completedParts: 4, report } });
    // Four arguments now: the receipt callback the budget ledger needs, and the
    // meter context the cost ledger needs. Whole-book analysis reads every
    // chapter, so it is the largest single spend on the platform — asserting
    // the meter here is what keeps it from going quiet again.
    expect(mocks.report).toHaveBeenCalledWith(
      inputChapters(),
      savedRun().notes,
      expect.any(Function),
      expect.objectContaining({ pipeline: "editorial" })
    );
    expect(savedRun().receipts).toEqual(Array.from({ length: 5 }, (_, step) => ({ step, reservedUnits: step === 4 ? 30000 : 20000, usage })));
    expect(mocks.budget.mock.calls.map(([input]) => input.jobId)).toEqual(Array.from({ length: 5 }, (_, step) => `${analysis.jobId}:${step}`));
    expect(mocks.budget.mock.invocationCallOrder[0]).toBeLessThan(mocks.notes.mock.invocationCallOrder[0]);
    expect(tables.ai_jobs[0].progress).toBe(100); expect(mocks.release).not.toHaveBeenCalled();
    expect(completed.headers.get("Cache-Control")).toBe("no-store");
  });
  it("returns saved reports after reload, flags manuscript edits, and hides private notes and receipts", async () => {
    const analysis = await start(); await finishParts(analysis.jobId, analysis.totalParts); await advance(analysis.jobId, analysis.totalParts);
    mocks.enabled.mockReturnValue(false);
    expect(await (await get()).json()).toMatchObject({ analysis: { status: "completed", stale: false, report } });
    tables.chapters[0].content = doc("A revised opening.");
    const loaded = await (await get()).json();
    expect(loaded).toMatchObject({ analysis: { stale: true, report } });
    expect(loaded.analysis).not.toHaveProperty("notes"); expect(loaded.analysis).not.toHaveProperty("receipts");
    expect(mocks.report).toHaveBeenCalledOnce();
  });
  it("returns an empty saved state before the first run", async () => {
    expect(await (await get()).json()).toMatchObject({ analysis: null, available: true, unavailableReason: null });
  });
  it.each([undefined, "", "false", "TRUE", "1"])("keeps whole-book work disabled with flag %s even when chapter AI is configured", async (flag) => {
    const analysis = await start();
    vi.stubEnv("WHOLE_BOOK_ANALYSIS_ENABLED", flag);
    mocks.db.mockClear(); mocks.admin.mockClear();
    const before = clone(tables.ai_jobs);
    expect((await post({ action: "start" })).status).toBe(503);
    expect((await advance(analysis.jobId, 0)).status).toBe(503);
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.budget).not.toHaveBeenCalled(); expect(mocks.notes).not.toHaveBeenCalled(); expect(mocks.report).not.toHaveBeenCalled();
    expect(tables.ai_jobs).toEqual(before);
    expect(await (await get()).json()).toMatchObject({ analysis: { jobId: analysis.jobId }, available: false, unavailableReason: expect.stringContaining("not enabled") });
    expect((await post({ action: "abandon", jobId: analysis.jobId })).status).toBe(200);
    expect(savedRun().receipts).toEqual([]);
  });
  it("preserves the author auth gate for reads and writes", async () => {
    mocks.gate.mockResolvedValue({ response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await post({ action: "start" })).status).toBe(401); expect((await get()).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.notes).not.toHaveBeenCalled();
  });
  it.each(["owner", "deleted", "book", "version"])("rejects inaccessible %s before reading a manuscript into AI", async (reason) => {
    if (reason === "owner") tables.books[0].author_id = otherId;
    if (reason === "deleted") tables.books[0].deleted_at = "2026-09-17T00:00:00.000Z";
    if (reason === "book") tables.books = [];
    if (reason === "version") tables.book_versions[0].book_id = otherId;
    const expected = reason === "owner" ? 403 : 404;
    expect((await post({ action: "start" })).status).toBe(expected); expect((await get()).status).toBe(expected);
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.notes).not.toHaveBeenCalled();
  });
  it("excludes deleted chapters and chapters from other books or editions", async () => {
    tables.chapters.push({ ...makeChapter(3, "Deleted secret."), deleted_at: "2026-09-17" }, { ...makeChapter(4, "Other book secret."), book_id: otherId }, { ...makeChapter(5, "Other edition secret."), book_version_id: otherId });
    const analysis = await start();
    expect(analysis.chapters).toHaveLength(3); expect(analysis.totalParts).toBe(4);
    await finishParts(analysis.jobId, analysis.totalParts);
    expect(JSON.stringify(mocks.notes.mock.calls)).not.toContain("secret");
  });
  it.each(["user_id", "book_id", "book_version_id", "kind"])("scopes an existing job by %s", async (field) => {
    const analysis = await start(); tables.ai_jobs[0][field] = otherId;
    expect((await advance(analysis.jobId, 0)).status).toBe(404);
    expect(mocks.notes).not.toHaveBeenCalled(); expect(mocks.budget).not.toHaveBeenCalled();
    expect(await (await get()).json()).toMatchObject({ analysis: null });
  });
  it.each(["off", "cap", "provider"])("fails closed with %s unconfigured", async (reason) => {
    if (reason === "off") mocks.enabled.mockReturnValue(false);
    if (reason === "cap") vi.stubEnv("EDITORIAL_DAILY_BUDGET", "");
    if (reason === "provider") vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await post({ action: "start" })).status).toBe(503);
    expect(await (await get()).json()).toMatchObject({ available: false, unavailableReason: expect.any(String) });
    expect(mocks.notes).not.toHaveBeenCalled(); expect(mocks.budget).not.toHaveBeenCalled(); expect(tables.ai_jobs).toHaveLength(0);
  });
  // CSRF is middleware.ts's job, and it compares Origin against
  // NEXT_PUBLIC_SITE_URL. This route used to repeat the check against
  // new URL(request.url).origin, which is the origin the *server* saw. Behind
  // Railway's TLS-terminating proxy that is not what the browser sent, so it
  // 403'd real authors. The test below passed anyway, because under vitest
  // request.url and the browser origin are the same string — which is exactly
  // why the bug reached production. Asserting the opposite now keeps the
  // broken check from coming back.
  it("leaves Origin to the middleware and does not reject on it", async () => {
    expect((await post({ action: "start" }, bookId, "https://www.verkli.com")).status).not.toBe(403);
  });

  it("rejects invalid IDs, rate limits and single-chapter manuscripts before creating a job", async () => {
    expect((await post({ action: "start" }, "invalid")).status).toBe(400);
    mocks.check.mockResolvedValueOnce({ allowed: false }); expect((await post({ action: "start" })).status).toBe(429);
    tables.chapters = [makeChapter(0, "Only chapter.")]; expect((await post({ action: "start" })).status).toBe(422);
    expect(mocks.budget).not.toHaveBeenCalled(); expect(tables.ai_jobs).toHaveLength(0);
  });
  it("rejects real content size limits rather than saving a partial manifest", async () => {
    tables.chapters[0].content = doc("a".repeat(600001));
    const response = await post({ action: "start" });
    expect(response.status).toBe(422); expect((await response.json()).error).toContain("600,000");
    expect(tables.ai_jobs).toHaveLength(0); expect(mocks.notes).not.toHaveBeenCalled();
  });
  it("rejects stale manuscripts before reserving a new step", async () => {
    const analysis = await start(); tables.chapters[0].content = doc("Changed before advance.");
    expect((await advance(analysis.jobId, 0)).status).toBe(409);
    expect(mocks.budget).not.toHaveBeenCalled(); expect(mocks.notes).not.toHaveBeenCalled();
  });
  it("rejects future steps and returns old-step duplicates without another model call", async () => {
    const analysis = await start();
    expect((await advance(analysis.jobId, 1)).status).toBe(409);
    expect((await advance(analysis.jobId, 0)).status).toBe(200);
    expect((await advance(analysis.jobId, 0)).status).toBe(200);
    expect(mocks.notes).toHaveBeenCalledOnce(); expect(mocks.budget).toHaveBeenCalledOnce();
    await finishParts(analysis.jobId, analysis.totalParts);
    await advance(analysis.jobId, analysis.totalParts);
    const calls = mocks.budget.mock.calls.length;
    expect((await advance(analysis.jobId, analysis.totalParts)).status).toBe(200);
    expect(mocks.budget).toHaveBeenCalledTimes(calls); expect(mocks.report).toHaveBeenCalledOnce();
  });
  it("allows only one claimant when two requests advance the same part", async () => {
    const analysis = await start();
    const responses = await Promise.all([advance(analysis.jobId, 0), advance(analysis.jobId, 0)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(mocks.notes).toHaveBeenCalledOnce(); expect(mocks.budget).toHaveBeenCalledOnce();
    expect(savedRun().completedParts).toBe(1);
  });
  it("compares the exact completed-part count when 100-part runs share rounded progress", async () => {
    tables.chapters = Array.from({ length: 100 }, (_, index) => makeChapter(index, `Chapter ${index}.`));
    const analysis = await start(); expect(analysis.totalParts).toBe(100);
    beforeClaim = () => { tables.ai_jobs[0].output = { ...savedRun(), completedParts: 1 }; tables.ai_jobs[0].progress = 0; };
    expect((await advance(analysis.jobId, 0)).status).toBe(409);
    expect(mocks.notes).not.toHaveBeenCalled(); expect(mocks.budget).not.toHaveBeenCalled();
    expect(history.find((query) => query.patch?.status === "processing")?.filters).toContainEqual(["output->>completedParts", "0"]);
  });
  it("retains usage and never refunds an attempted model call that rejects its answer", async () => {
    const analysis = await start();
    mocks.notes.mockImplementationOnce(async (_part, onUsage) => { await onUsage(usage); throw new Error("Invalid quotation after provider response"); });
    expect((await advance(analysis.jobId, 0)).status).toBe(502);
    expect(tables.ai_jobs[0].status).toBe("failed"); expect(savedRun().report).toBeNull();
    expect(savedRun().receipts).toEqual([{ step: 0, reservedUnits: 20000, usage }]);
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it("does not refund when the provider fails before returning a usage receipt", async () => {
    const analysis = await start(); mocks.notes.mockRejectedValueOnce(new Error("Provider connection lost"));
    expect((await advance(analysis.jobId, 0)).status).toBe(502);
    expect(savedRun().receipts[0]).toMatchObject({ step: 0, usage: null }); expect(mocks.release).not.toHaveBeenCalled();
  });
  it("refunds a reserved step only when receipt persistence prevents model work from starting", async () => {
    const analysis = await start(); failReceipt = 1;
    expect((await advance(analysis.jobId, 0)).status).toBe(503);
    expect(mocks.release).toHaveBeenCalledWith({ pipeline: "editorial", jobId: `${analysis.jobId}:0` });
    expect(mocks.notes).not.toHaveBeenCalled(); expect(tables.ai_jobs[0].status).toBe("failed");
  });
  it("fails closed on budget exhaustion and Redis failure without generation or refund", async () => {
    const analysis = await start();
    mocks.budget.mockRejectedValueOnce(new BudgetExceededError({ userId: authorId, pipeline: "editorial", day: "2026-09-17", key: "test", current: 100, limit: 100, jobId: analysis.jobId }));
    expect((await advance(analysis.jobId, 0)).status).toBe(429);
    const next = await start(); mocks.budget.mockRejectedValueOnce(new Error("Redis unavailable"));
    expect((await advance(next.jobId, 0)).status).toBe(503);
    expect(mocks.notes).not.toHaveBeenCalled(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it("stops before reservation if the next full synthesis exceeds its payload limit", async () => {
    const analysis = await start(); await finishParts(analysis.jobId, analysis.totalParts);
    const reserved = mocks.budget.mock.calls.length;
    mocks.estimateReport.mockImplementationOnce(() => { throw new Error("Whole-book analysis notes exceed the synthesis limit."); });
    expect((await advance(analysis.jobId, analysis.totalParts)).status).toBe(422);
    expect(mocks.budget).toHaveBeenCalledTimes(reserved); expect(mocks.report).not.toHaveBeenCalled();
    expect(tables.ai_jobs[0].status).toBe("failed");
  });
  it("retains the paid receipt but rejects source mutation during a model request", async () => {
    const analysis = await start();
    mocks.notes.mockImplementationOnce(async (_part, onUsage) => { await onUsage(usage); tables.chapters[1].content = doc("Edited during analysis."); return []; });
    const response = await advance(analysis.jobId, 0);
    expect(response.status).toBe(409); expect((await response.json()).error).toContain("changed during analysis");
    expect(savedRun().receipts[0].usage).toEqual(usage); expect(tables.ai_jobs[0].status).toBe("failed"); expect(mocks.release).not.toHaveBeenCalled();
    expect(await (await get()).json()).toMatchObject({ analysis: { stale: true, report: null } });
  });
  it("recovers an ambiguously acknowledged completed write without overwriting it as failed", async () => {
    const analysis = await start(); await finishParts(analysis.jobId, analysis.totalParts); ambiguousSave = "completed";
    const response = await advance(analysis.jobId, analysis.totalParts);
    expect(response.status).toBe(502); expect((await response.json()).error).toContain("save response was interrupted");
    expect(tables.ai_jobs[0].status).toBe("completed"); expect(savedRun().report).toEqual(report);
    expect(history.filter((query) => query.patch?.status === "failed")).toHaveLength(0);
    expect(await (await get()).json()).toMatchObject({ analysis: { status: "completed", report } });
    expect((await advance(analysis.jobId, analysis.totalParts)).status).toBe(200);
    expect(mocks.report).toHaveBeenCalledOnce(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it("recovers an ambiguously acknowledged part write without processing the part again", async () => {
    const analysis = await start(); ambiguousSave = "pending";
    expect((await advance(analysis.jobId, 0)).status).toBe(502);
    expect(await (await get()).json()).toMatchObject({ analysis: { status: "pending", completedParts: 1 } });
    expect((await advance(analysis.jobId, 0)).status).toBe(200);
    expect(mocks.notes).toHaveBeenCalledOnce(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it("does not overwrite a later claim when the previous completion transport rejects", async () => {
    const analysis = await start(); throwAfterPartSave = true;
    const response = await advance(analysis.jobId, 0);
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("save response was interrupted");
    expect(tables.ai_jobs[0].status).toBe("processing");
    expect(savedRun().completedParts).toBe(1);
    expect(history.filter((query) => query.patch?.status === "failed")).toHaveLength(0);
    expect(mocks.notes).toHaveBeenCalledOnce(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it("explicitly abandons a stranded claim without refund, retry or configuration requirements", async () => {
    const analysis = await start(); tables.ai_jobs[0].status = "processing";
    tables.ai_jobs[0].output = { ...savedRun(), receipts: [{ step: 0, reservedUnits: 20000, usage }] };
    mocks.enabled.mockReturnValue(false); vi.stubEnv("EDITORIAL_DAILY_BUDGET", ""); vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await post({ action: "abandon", jobId: analysis.jobId });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ analysis: { status: "failed", report: null } });
    expect(savedRun().receipts).toEqual([{ step: 0, reservedUnits: 20000, usage }]);
    expect(mocks.notes).not.toHaveBeenCalled(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it("preserves abandonment when an in-flight provider response arrives later", async () => {
    const analysis = await start();
    let finish!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    mocks.notes.mockImplementationOnce(async (_part, onUsage) => {
      await onUsage(usage); started(); await new Promise<void>((resolve) => { finish = resolve; }); return [];
    });
    const active = advance(analysis.jobId, 0); await entered;
    const stopped = await post({ action: "abandon", jobId: analysis.jobId });
    finish(); await active;
    expect(stopped.status).toBe(200); expect(tables.ai_jobs[0].status).toBe("failed");
    expect(tables.ai_jobs[0].error).toContain("Stopped by you");
    expect(savedRun().report).toBeNull(); expect(savedRun().receipts[0].usage).toEqual(usage);
    expect(mocks.release).not.toHaveBeenCalled();
    const fresh = await start(); expect(fresh.jobId).not.toBe(analysis.jobId);
  });
  it("cannot abandon another owner's run or a completed report", async () => {
    const analysis = await start();
    tables.ai_jobs[0].user_id = otherId;
    expect((await post({ action: "abandon", jobId: analysis.jobId })).status).toBe(404);
    tables.ai_jobs[0].user_id = authorId; await finishParts(analysis.jobId, analysis.totalParts); await advance(analysis.jobId, analysis.totalParts);
    expect((await post({ action: "abandon", jobId: analysis.jobId })).status).toBe(409);
    expect(tables.ai_jobs[0].status).toBe("completed");
  });
  it("resumes after a daily budget reset without rereading already paid parts", async () => {
    const analysis = await start(); await advance(analysis.jobId, 0);
    const paid = savedRun();
    mocks.budget.mockRejectedValueOnce(new BudgetExceededError({ userId: authorId, pipeline: "editorial", day: "2026-09-17", key: "test", current: 100, limit: 100, jobId: analysis.jobId }));
    expect((await advance(analysis.jobId, 1)).status).toBe(429);
    expect(tables.ai_jobs[0].status).toBe("pending"); expect(savedRun()).toEqual(paid);
    expect((await advance(analysis.jobId, 1)).status).toBe(200);
    expect(savedRun().completedParts).toBe(2); expect(mocks.notes).toHaveBeenCalledTimes(2);
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
