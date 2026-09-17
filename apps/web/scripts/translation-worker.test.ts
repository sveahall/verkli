import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError, type Job } from "bullmq";
import type { QualityInput, QualityReport } from "../src/lib/ai/translation-quality/types";
import type { TranslationJobData } from "../src/lib/translation-queue";

const mocks = vi.hoisted(() => ({
  client: vi.fn(), profile: vi.fn(), translate: vi.fn(), state: vi.fn(),
  checkBudget: vi.fn(), releaseBudget: vi.fn(), validateJobCost: vi.fn(),
  worker: vi.fn(), workerOn: vi.fn(), workerClose: vi.fn(), connection: vi.fn(),
  assertServerEnv: vi.fn(), heartbeat: vi.fn(), activation: vi.fn(() => true),
}));
vi.mock("bullmq", async (original) => ({
  ...await original<object>(),
  Worker: class {
    constructor(...args: unknown[]) { mocks.worker(...args); }
    on(...args: unknown[]) { mocks.workerOn(...args); return this; }
    close = mocks.workerClose;
  },
}));
vi.mock("./load-dotenv", () => ({}));
vi.mock("./sentry-worker-init", () => ({ Sentry: { captureException: vi.fn() } }));
vi.mock("../src/lib/env", () => ({ assertServerEnv: mocks.assertServerEnv, getRedisConnectionOptions: mocks.connection }));
vi.mock("../src/lib/supabase/admin", () => ({ createAdminClient: mocks.client }));
vi.mock("../src/lib/translation-pairs", () => ({ getProviderForPair: () => "anthropic" }));
vi.mock("../src/lib/ai/translation-quality/anthropic", () => ({ createAuthorProfile: mocks.profile, translateWithQuality: mocks.translate }));
vi.mock("../src/lib/import-extract", () => ({ contentHash: (text: string) => `hash:${text}` }));
vi.mock("../src/lib/book-translation", async (original) => ({ ...await original<object>(), upsertBookTranslationState: mocks.state }));
vi.mock("../src/lib/workers/idempotency", () => ({ isDuplicate: async () => false }));
vi.mock("../src/lib/workers/budget", () => ({
  checkBudget: mocks.checkBudget, releaseBudget: mocks.releaseBudget, validateJobCost: mocks.validateJobCost,
  BudgetExceededError: class extends Error {}, JobCostExceededError: class extends Error {},
}));
vi.mock("../src/lib/translation-quality-budget", async (original) => ({
  ...await original<object>(),
  estimateTranslationQualityBook: () => ({ sourceChars: 100, batchCount: 2, maxCalls: 13, estimatedCostUnits: 1000 }),
  translationQualityReservationKey: () => "queue-job-attempt",
}));
vi.mock("../src/lib/translation-commit", async (original) => ({ ...await original<object>(), reviewedTranslationActivationReady: mocks.activation }));
vi.mock("../src/lib/health/worker-heartbeat", () => ({ startHeartbeatInterval: mocks.heartbeat }));

import { createHash } from "node:crypto";
import type { TranslationCommitRequest } from "../src/lib/translation-commit";
type Row = Record<string, unknown>;
type Write = { table: string; operation: string; values: Row[] };
const payload: TranslationJobData = {
  bookId: "book", authorId: "author", sourceVersionId: "source-version",
  targetVersionId: "target-version", sourceLanguage: "sv", targetLanguage: "en", overwrite: true,
};
const profile = { voice: "Spare", rhythm: "Repetition", dialogue: "Abrupt", preserve: [], glossary: [] };
const report: QualityReport = {
  status: "checks_passed", profile, issues: [], revisionCount: 0, reviewRounds: 1,
  model: "test", rubricVersion: "test", usage: { inputTokens: 1, outputTokens: 1 },
};

/** Execute fluent queries against isolated rows so deletes and ID changes are observable. */
function database() {
  const tables: Record<string, Row[]> = {
    books: [{ id: "book", author_id: "author", original_language: "sv", language: "sv", deleted_at: null }],
    book_versions: [
      { id: "source-version", book_id: "book", language_code: "sv", status: "draft", visibility: "private", published_at: null },
      { id: "target-version", book_id: "book", language_code: "en", status: "draft", visibility: "private", published_at: null },
    ],
    chapters: [
      { id: "source-one", book_id: "book", book_version_id: "source-version", title: "Ett", content: "Hon väntar.", order: 0 },
      { id: "source-two", book_id: "book", book_version_id: "source-version", title: "Två", content: "Igen. Igen.", order: 1 },
      { id: "old-target-one", book_id: "book", book_version_id: "target-version", title: "Old one", content: "Previously edited first chapter.", order: 0 },
      { id: "old-target-two", book_id: "book", book_version_id: "target-version", title: "Old two", content: "Previously edited second chapter.", order: 1 },
    ],
    ai_jobs: [],
  };
  tables.book_versions.forEach((row) => Object.assign(row, { updated_at: "2026-09-16T10:00:00.123456Z" }));
  tables.chapters.forEach((row) => Object.assign(row, { deleted_at: null, version_number: 1, updated_at: "2026-09-16T10:00:00.123456Z" }));
  let versionRevision = 0;
  const writes: Write[] = [];
  const events: string[] = [];
  const state: { failStatusWrites: boolean; beforeMutation: (table: string, operation: string, values: Row[]) => void } = { failStatusWrites: false, beforeMutation: () => {} };
  function from(table: string) {
    let operation = "select";
    let values: Row[] = [];
    let single = false;
    let sortKey: string | null = null;
    let conflictKeys: string[] = [];
    const filters: Array<(row: Row) => boolean> = [];
    const matches = (row: Row) => filters.every((filter) => filter(row));
    const execute = () => {
      state.beforeMutation(table, operation, values);
      let rows = tables[table] ?? [];
      let returned: Row[] | null = null;
      if (operation !== "select") {
        writes.push({ table, operation, values: structuredClone(values) });
        events.push(`${table}:${operation}`);
        if (state.failStatusWrites && values.some((row) => row.status === "failed" || (row.output as Row | undefined)?.status === "needs_review")) {
          return { data: null, error: { message: "Status storage unavailable" } };
        }
        if (operation === "delete") {
          returned = rows.filter(matches);
          tables[table] = rows = rows.filter((row) => !matches(row));
        }
        if (operation === "update") {
          returned = rows.filter(matches);
          returned.forEach((row) => {
            const revision = Number(row.version_number ?? 0);
            Object.assign(row, structuredClone(values[0]));
            if (table === "chapters") row.version_number = revision + 1;
            if (table === "book_versions" || table === "ai_jobs") row.updated_at = `2026-09-16T11:00:00.${String(++versionRevision).padStart(6, "0")}Z`;
          });
        }
        if (operation === "insert" || operation === "upsert") {
          returned = [];
          for (const value of values) {
            const uniqueKeys = table === "chapters" ? ["book_version_id", "order"] : table === "book_versions" ? ["book_id", "language_code"] : ["id"];
            if (operation === "insert" && rows.some((row) => uniqueKeys.every((key) => row[key] === value[key]))) return { data: null, error: { code: "23505", message: "Duplicate row" } };
            const existing = operation === "upsert" && conflictKeys.length > 0
              ? rows.find((row) => conflictKeys.every((key) => row[key] === value[key])) : undefined;
            if (existing) { Object.assign(existing, structuredClone(value)); returned.push(existing); }
            else {
              const inserted = { id: `generated-${table}-${rows.length}`, version_number: 1, updated_at: "2026-09-16T11:00:00.123456Z", ...structuredClone(value) };
              rows.push(inserted); returned.push(inserted);
            }
          }
        }
      }
      const selected = structuredClone(returned ?? rows.filter(matches));
      if (sortKey) selected.sort((a, b) => Number(a[sortKey!]) - Number(b[sortKey!]));
      return { data: single ? selected[0] ?? null : selected, error: null, count: selected.length };
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        const [column, field] = key.split("->>");
        filters.push((row) => (field ? (row[column] as Row | undefined)?.[field] : row[column]) === value); return query;
      },
      in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
      not: (key: string, operator: string, value: string) => {
        if (operator !== "in") throw new Error(`Unsupported test filter: ${operator}`);
        const excluded = value.slice(1, -1).split(",");
        filters.push((row) => !excluded.includes(String(row[key]))); return query;
      },
      is: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
      order: (key: string) => { sortKey = key; return query; },
      limit: () => query,
      update: (value: Row) => { operation = "update"; values = [value]; return query; },
      insert: (value: Row | Row[]) => { operation = "insert"; values = Array.isArray(value) ? value : [value]; return query; },
      upsert: (value: Row | Row[], options?: { onConflict?: string }) => {
        operation = "upsert"; values = Array.isArray(value) ? value : [value]; conflictKeys = options?.onConflict?.split(",") ?? []; return query;
      },
      delete: () => { operation = "delete"; return query; },
      single: () => { single = true; return Promise.resolve(execute()); },
      maybeSingle: () => { single = true; return Promise.resolve(execute()); },
      then: (resolve: (result: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
    };
    return query;
  }
  const rpc = vi.fn(async (_name: string, request: TranslationCommitRequest) => {
    state.beforeMutation("rpc", "commit", [request as unknown as Row]);
    const job = tables.ai_jobs.find((row) => row.id === request.p_job_id)!;
    const digest = createHash("sha256").update(JSON.stringify(request)).digest("hex");
    const output = job.output as Row;
    if (job.status === "completed") {
      const commit = output._translationCommit as Row;
      if (commit?.requestDigest === digest) return { data: { ...(commit.receipt as Row), replayed: true }, error: null };
      return { data: null, error: { code: "40001" } };
    }
    const target = tables.book_versions[1];
    const project = (row: Row) => Object.fromEntries(["id", "title", "content", "order", "updated_at", "version_number", "deleted_at"].map((key) => [key, row[key]]));
    const source = tables.chapters.filter((row) => row.book_version_id === "source-version" && row.deleted_at === null && (request.p_scope === "book" || row.id === request.p_expected_source[0].id));
    const before = tables.chapters.filter((row) => row.book_version_id === "target-version" && (request.p_scope === "book" || row.order === source[0]?.order));
    if (target.published_at || target.status !== "translating" || target.updated_at !== request.p_claim_revision ||
        JSON.stringify(source.map(project)) !== JSON.stringify(request.p_expected_source.map(project)) ||
        JSON.stringify(before.map(project)) !== JSON.stringify(request.p_expected_target.map(project)) ||
        tables.book_versions[0].updated_at !== request.p_source_revision || job.updated_at !== request.p_job_revision) return { data: null, error: { code: "40001" } };
    for (const chapter of request.p_chapters) {
      const row = before.find((row) => row.order === chapter.order);
      if (row) Object.assign(row, chapter, { version_number: Number(row.version_number) + 1 });
      else tables.chapters.push({ ...chapter, id: "inserted-target", book_id: "book", book_version_id: "target-version", deleted_at: null, version_number: 1 });
    }
    if (request.p_overwrite && request.p_scope === "book") tables.chapters = tables.chapters.filter((row) => row.book_version_id !== "target-version" || request.p_chapters.some((chapter) => chapter.order === row.order));
    Object.assign(target, { status: request.p_scope === "book" ? "done" : "draft", error_message: null });
    const receipt = { jobId: job.id, versionId: target.id, savedChapters: request.p_chapters.length, updatedAt: target.updated_at, replayed: false };
    Object.assign(job, { status: "completed", output: { ...request.p_final_report, _translationCommit: { requestDigest: digest, receipt } } });
    return { data: receipt, error: null };
  });
  return {
    tables, writes, events, state, from, rpc,
    targetChapters: () => structuredClone(tables.chapters.filter((row) => row.book_version_id === "target-version")),
    chapterWrites: () => writes.filter((write) => write.table === "chapters"),
  };
}

let worker: typeof import("./translation-worker");
let db: ReturnType<typeof database>;
beforeAll(async () => {
  vi.stubEnv("PIPELINE_SMOKE_MODE", "false");
  worker = await import("./translation-worker");
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks();
  db = database();
  mocks.client.mockReturnValue(db);
  mocks.activation.mockReturnValue(true);
  mocks.profile.mockImplementation(async (_input, onUsage) => { await onUsage({ stage: "PROFILE", inputTokens: 1, outputTokens: 1 }); return profile; });
  mocks.state.mockResolvedValue(undefined);
  mocks.checkBudget.mockResolvedValue(undefined);
  mocks.translate.mockImplementation(async (input: QualityInput) => {
    db.events.push(`review:${input.texts[0]}`);
    await input.onUsage?.({ stage: "TRANSLATION", model: "test", cacheCreationTokens: 0, cacheReadTokens: 0, inputTokens: 1, outputTokens: 1 });
    return { translations: input.texts.map((text) => `Reviewed ${text}`), report };
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const start = (data: TranslationJobData = { ...payload }) => worker.processJob(data, "queue-job", async (id) => { data.reviewedRunId = id; db.events.push("queue:bound"); });
describe("translation worker atomic protocol", () => {
  it("holds activation before reading or spending", async () => {
    mocks.activation.mockReturnValue(false);
    await expect(start()).rejects.toThrow("awaiting");
    expect(db.writes).toEqual([]); expect(mocks.profile).not.toHaveBeenCalled();
  });
  it("durably binds queue identity before the ledger, claim and paid work", async () => {
    await start();
    expect(db.events.indexOf("queue:bound")).toBeLessThan(db.events.indexOf("ai_jobs:insert"));
    expect(db.events.indexOf("ai_jobs:insert")).toBeLessThan(db.events.indexOf("book_versions:update"));
    expect(db.tables.ai_jobs[0].status).toBe("completed");
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.chapterWrites()).toEqual([]);
    expect(mocks.state).not.toHaveBeenCalled();
    expect(Object.keys(db.rpc.mock.calls[0][1])).toHaveLength(15);
  });
  it("does not start paid work when durable queue binding fails", async () => {
    await expect(worker.processJob({ ...payload }, "queue-job", async () => { throw new Error("redis unavailable"); })).rejects.toBeInstanceOf(UnrecoverableError);
    expect(db.tables.ai_jobs).toEqual([]); expect(mocks.profile).not.toHaveBeenCalled();
  });
  it("does not claim a published edition", async () => {
    db.tables.book_versions[1].published_at = "2026-09-17T10:00:00Z";
    await expect(start()).rejects.toThrow("published"); expect(mocks.profile).not.toHaveBeenCalled();
  });
  it("rejects source and target tombstones before spend", async () => {
    db.tables.chapters[2].deleted_at = "2026-09-17T10:00:00Z";
    await expect(start()).rejects.toThrow(); expect(mocks.profile).not.toHaveBeenCalled();
  });
  it.each(["publish", "source-delete", "source-changed-back", "source-edition", "target-edit", "insert-target"])("atomically rejects a %s race at the RPC boundary", async (race) => {
    const initial = db.targetChapters();
    db.state.beforeMutation = (table) => {
      if (table !== "rpc") return;
      if (race === "publish") db.tables.book_versions[1].published_at = "2026-09-17T10:00:00Z";
      if (race === "source-delete") db.tables.chapters[0].deleted_at = "2026-09-17T10:00:00Z";
      if (race === "source-changed-back") db.tables.chapters[0].version_number = 3;
      if (race === "source-edition") db.tables.book_versions[0].updated_at = "2026-09-17T10:00:00Z";
      if (race === "target-edit") db.tables.chapters[3].content = "New author edit";
      if (race === "insert-target") db.tables.chapters.push({ ...db.tables.chapters[3], id: "extra", order: 2 });
    };
    await expect(start()).rejects.toThrow("no chapters were saved");
    expect(db.tables.chapters[2].content).toBe(initial[0].content);
    expect(db.chapterWrites()).toEqual([]);
    expect(db.tables.ai_jobs[0].status).not.toBe("completed");
  });
  it("retains paid receipts when a later chapter fails review and never refunds", async () => {
    mocks.translate.mockImplementationOnce(async (input: QualityInput) => { await input.onUsage?.({ stage: "TRANSLATION", model: "test", cacheCreationTokens: 0, cacheReadTokens: 0, inputTokens: 2, outputTokens: 2 }); return { translations: input.texts.map((s) => `Reviewed ${s}`), report }; })
      .mockImplementationOnce(async (input: QualityInput) => ({ translations: input.texts.map((s) => `Reviewed ${s}`), report: { ...report, status: "needs_review" } }));
    const initial = db.targetChapters();
    await expect(start()).rejects.toThrow("needs editorial review");
    expect(db.targetChapters()).toEqual(initial); expect(db.rpc).not.toHaveBeenCalled();
    expect((db.tables.ai_jobs[0].output as Row).usageReceipts).toHaveLength(2);
    expect(mocks.releaseBudget).not.toHaveBeenCalled();
  });
  it("drains receipt writes before freezing the final report", async () => {
    await start();
    const request = db.rpc.mock.calls[0][1];
    expect(request.p_final_report.usageReceipts).toHaveLength(3);
    expect(request.p_final_report.batches).toHaveLength(2);
    expect(request.p_expected_source[0]).toMatchObject({ version_number: 1, deleted_at: null });
  });
  it("replays exactly after a lost response without translating twice", async () => {
    const rpc = db.rpc.getMockImplementation()!;
    db.rpc.mockImplementationOnce(async (...args) => { await rpc(...args); throw new Error("response lost"); });
    await start();
    expect(db.rpc).toHaveBeenCalledTimes(2); expect(mocks.translate).toHaveBeenCalledTimes(2);
    expect(db.tables.chapters[2].version_number).toBe(2); expect(db.tables.ai_jobs[0].status).toBe("completed");
  });
  it("keeps persistent unknown outcome processing without false failure or refund", async () => {
    db.rpc.mockRejectedValue(new Error("network unavailable"));
    await expect(start()).rejects.toThrow("Checking whether");
    expect(db.tables.book_versions[1].status).toBe("translating"); expect(db.tables.ai_jobs[0].status).toBe("processing");
    expect(mocks.releaseBudget).not.toHaveBeenCalled();
  });
  it("recovers a committed queue-bound run after crash even after editorial changes", async () => {
    const data = { ...payload }; await start(data);
    db.tables.chapters[2].content = "Later edit"; db.tables.book_versions[1].published_at = "2026-09-17T10:00:00Z";
    mocks.translate.mockClear(); const writes = db.writes.length;
    await start(data);
    expect(mocks.translate).not.toHaveBeenCalled(); expect(db.writes).toHaveLength(writes);
    expect(db.tables.chapters[2].content).toBe("Later edit");
  });
  it("does not restart model work after a pre-commit process crash", async () => {
    const data = { ...payload }; db.rpc.mockRejectedValue(new Error("network unavailable"));
    await expect(start(data)).rejects.toThrow(); mocks.translate.mockClear();
    await expect(start(data)).rejects.toThrow("Checking whether");
    expect(mocks.translate).not.toHaveBeenCalled(); expect(db.tables.ai_jobs[0].status).toBe("processing");
  });
  it("rejects an unbound legacy receipt even if it claims the new protocol", async () => {
    db.tables.ai_jobs.push({ id: "legacy", kind: "translation_quality", input: { reservationKey: "queue-job", protocol: "reviewed-atomic-v2" }, status: "completed" });
    await expect(start()).rejects.toThrow("Checking whether"); expect(mocks.profile).not.toHaveBeenCalled(); expect(mocks.releaseBudget).not.toHaveBeenCalled();
  });
  it("does not overwrite a terminal receipt during stalled recovery", async () => {
    const data = { ...payload }; await start(data); const saved = structuredClone(db.tables);
    await worker.reconcileFailedTranslation({ id: "queue-job", timestamp: 1, data } as Job, new Error("stalled more than allowable limit"));
    expect(db.tables).toEqual(saved); expect(mocks.releaseBudget).not.toHaveBeenCalled();
  });
  it("saves only the selected chapter and keeps the edition draft", async () => {
    const other = { ...db.tables.chapters[3] };
    await start({ ...payload, chapterId: "source-one" });
    expect(db.tables.chapters[3]).toEqual(other); expect(db.tables.book_versions[1].status).toBe("draft");
  });
});
