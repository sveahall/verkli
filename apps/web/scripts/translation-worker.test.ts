import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import type { QualityInput, QualityReport } from "../src/lib/ai/translation-quality/types";
import type { TranslationJobData } from "../src/lib/translation-queue";

const mocks = vi.hoisted(() => ({
  client: vi.fn(), profile: vi.fn(), translate: vi.fn(), state: vi.fn(),
  checkBudget: vi.fn(), releaseBudget: vi.fn(), validateJobCost: vi.fn(),
  worker: vi.fn(), workerOn: vi.fn(), workerClose: vi.fn(), connection: vi.fn(),
  assertServerEnv: vi.fn(), heartbeat: vi.fn(),
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
vi.mock("../src/lib/health/worker-heartbeat", () => ({ startHeartbeatInterval: mocks.heartbeat }));

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
    books: [{ id: "book", author_id: "author", original_language: "sv", language: "sv" }],
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
  const writes: Write[] = [];
  const events: string[] = [];
  const state = { failStatusWrites: false };
  function from(table: string) {
    let operation = "select";
    let values: Row[] = [];
    let single = false;
    let sortKey: string | null = null;
    let conflictKeys: string[] = [];
    const filters: Array<(row: Row) => boolean> = [];
    const matches = (row: Row) => filters.every((filter) => filter(row));
    const execute = () => {
      let rows = tables[table] ?? [];
      if (operation !== "select") {
        writes.push({ table, operation, values: structuredClone(values) });
        events.push(`${table}:${operation}`);
        if (state.failStatusWrites && values.some((row) => row.status === "failed" || (row.output as Row | undefined)?.status === "needs_review")) {
          return { data: null, error: { message: "Status storage unavailable" } };
        }
        if (operation === "delete") tables[table] = rows = rows.filter((row) => !matches(row));
        if (operation === "update") rows.filter(matches).forEach((row) => Object.assign(row, structuredClone(values[0])));
        if (operation === "insert" || operation === "upsert") {
          for (const value of values) {
            const existing = operation === "upsert" && conflictKeys.length > 0
              ? rows.find((row) => conflictKeys.every((key) => row[key] === value[key])) : undefined;
            if (existing) Object.assign(existing, structuredClone(value));
            else rows.push({ id: `generated-${table}-${rows.length}`, ...structuredClone(value) });
          }
        }
      }
      const selected = structuredClone(rows.filter(matches));
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
  return {
    tables, writes, events, state, from,
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
  mocks.profile.mockResolvedValue(profile);
  mocks.state.mockResolvedValue(undefined);
  mocks.checkBudget.mockResolvedValue(undefined);
  mocks.translate.mockImplementation(async (input: QualityInput) => {
    db.events.push(`review:${input.texts[0]}`);
    return { translations: input.texts.map((text) => `Reviewed ${text}`), report };
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("translation worker quality gate", () => {
  it("keeps every old target chapter and ID when the second chapter needs review", async () => {
    const original = db.targetChapters();
    mocks.translate.mockImplementation(async (input: QualityInput) => ({
      translations: input.texts.map((text) => `Reviewed ${text}`),
      report: input.texts[0] === "Två" ? { ...report, status: "needs_review", revisionCount: 1, reviewRounds: 2 } : report,
    }));

    await expect(worker.processJob(payload, "queue-job")).rejects.toBeInstanceOf(worker.TranslationQualityStoppedError);

    expect(mocks.translate).toHaveBeenCalledTimes(2);
    expect(db.chapterWrites()).toEqual([]);
    expect(db.targetChapters()).toEqual(original);
    expect(db.writes.some((write) => write.values.some((row) => (row.output as Row | undefined)?.status === "needs_review"))).toBe(true);
  });

  it("rejects a published target before model calls or chapter mutation", async () => {
    db.tables.book_versions[1].published_at = "2026-09-14T10:00:00.000Z";
    const original = db.targetChapters();

    await expect(worker.processJob(payload, "queue-job")).rejects.toThrow(/publish/i);

    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.translate).not.toHaveBeenCalled();
    expect(db.chapterWrites()).toEqual([]);
    expect(db.targetChapters()).toEqual(original);
  });

  it("writes reviewed chapters only after every review passes and preserves existing IDs", async () => {
    const ids = db.targetChapters().map((row) => row.id);

    await expect(worker.processJob(payload, "queue-job")).resolves.toBeUndefined();

    const firstWrite = db.events.findIndex((event) => event.startsWith("chapters:"));
    expect(firstWrite).toBeGreaterThan(db.events.indexOf("review:Två"));
    expect(db.chapterWrites().some((write) => write.operation === "upsert")).toBe(true);
    expect(db.targetChapters().map((row) => row.id)).toEqual(ids);
    expect(db.targetChapters().map((row) => row.content)).toEqual(["Reviewed Hon väntar.", "Reviewed Igen. Igen."]);
    expect(db.tables.book_versions[1].status).toBe("done");
    expect(mocks.profile).toHaveBeenCalledOnce();
    expect(mocks.translate.mock.calls.every(([input]) => input.profile === profile)).toBe(true);
  });

  it("remains unrecoverable when persisting failed status also throws", async () => {
    const original = db.targetChapters();
    db.state.failStatusWrites = true;
    mocks.state.mockImplementation(async (_client: unknown, state: { status: string }) => {
      if (state.status === "failed") throw new Error("Status storage unavailable");
    });
    mocks.translate.mockRejectedValue(new Error("Reviewer unavailable"));

    const error = await worker.processJob(payload, "queue-job").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(worker.TranslationQualityStoppedError);
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(mocks.translate).toHaveBeenCalledOnce();
    expect(db.chapterWrites()).toEqual([]);
    expect(db.targetChapters()).toEqual(original);
  });

  it("leaves the target untouched when the source changes during review", async () => {
    const original = db.targetChapters();
    mocks.translate.mockImplementation(async (input: QualityInput) => {
      if (input.texts[0] === "Två") db.tables.chapters[0].content = "The author changed this passage.";
      return { translations: input.texts.map((text) => `Reviewed ${text}`), report };
    });

    await expect(worker.processJob(payload, "queue-job")).rejects.toBeInstanceOf(worker.TranslationQualityStoppedError);

    expect(mocks.translate).toHaveBeenCalledTimes(2);
    expect(db.chapterWrites()).toEqual([]);
    expect(db.targetChapters()).toEqual(original);
  });

  it.each([false, true])("does not restart an interrupted paid run when failure persistence is unavailable: %s", async (failStatusWrites) => {
    const original = db.targetChapters();
    db.tables.ai_jobs.push({
      id: "interrupted-review", user_id: "author", book_id: "book", kind: "translation_quality", status: "processing",
      input: { reservationKey: "queue-job" },
      output: {
        formatVersion: 1, scope: "book", sourceVersionId: "source-version", targetVersionId: "target-version",
        sourceHash: "source-at-start", status: "processing", profile, batches: [],
        checkedAt: "2026-09-14T10:00:00.000Z", error: null,
      },
    });
    db.state.failStatusWrites = failStatusWrites;
    mocks.state.mockImplementation(async (_client: unknown, state: { status: string }) => {
      if (failStatusWrites && state.status === "failed") throw new Error("Status storage unavailable");
    });

    const error = await worker.processJob(payload, "queue-job").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(worker.TranslationQualityStoppedError);
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error).toMatchObject({ message: expect.stringMatching(/interrupted/i) });
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.translate).not.toHaveBeenCalled();
    expect(db.chapterWrites()).toEqual([]);
    expect(db.targetChapters()).toEqual(original);
    expect(db.writes.filter((write) => write.table === "ai_jobs" && write.operation === "insert")).toEqual([]);
    const failureWrite = db.writes.find((write) => write.table === "ai_jobs" && write.operation === "update");
    expect(failureWrite?.values[0]).toMatchObject({
      status: "failed", output: { status: "failed", error: expect.stringMatching(/interrupted/i) },
    });
    expect(db.tables.ai_jobs[0].status).toBe(failStatusWrites ? "processing" : "failed");
  });

  it("registers the queue consumer when a production launcher dynamically imports the module", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousRedisUrl = process.env.REDIS_URL;
    const previousApiKey = process.env.ANTHROPIC_API_KEY;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "redis://mock-redis.invalid:6379");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    mocks.connection.mockReturnValue({ host: "mock-redis.invalid", port: 6379 });
    const processOn = vi.spyOn(process, "on").mockReturnValue(process);
    const processExit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("Unexpected process exit"); });
    vi.resetModules();
    try {
      await import("./translation-worker");

      expect(mocks.worker).toHaveBeenCalledOnce();
      expect(mocks.worker).toHaveBeenCalledWith("book-translation", expect.any(Function), expect.objectContaining({
        connection: { host: "mock-redis.invalid", port: 6379 }, concurrency: 2,
      }));
      expect(mocks.workerOn.mock.calls.map(([event]) => event)).toEqual(["completed", "failed", "error", "closed"]);
      expect(mocks.assertServerEnv).toHaveBeenCalledOnce();
      expect(mocks.heartbeat).toHaveBeenCalledWith("book-translation");
      expect(processOn).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
      expect(processOn).toHaveBeenCalledWith("SIGINT", expect.any(Function));
      expect(processExit).not.toHaveBeenCalled();
      expect(mocks.client).not.toHaveBeenCalled();
      expect(mocks.profile).not.toHaveBeenCalled();
      expect(mocks.translate).not.toHaveBeenCalled();
    } finally {
      vi.stubEnv("NODE_ENV", previousNodeEnv);
      vi.stubEnv("REDIS_URL", previousRedisUrl);
      vi.stubEnv("ANTHROPIC_API_KEY", previousApiKey);
      vi.resetModules();
    }
  });
});
