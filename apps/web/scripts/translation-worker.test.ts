import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError, type Job } from "bullmq";
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
  tables.book_versions.forEach((row) => Object.assign(row, { updated_at: "2026-09-16T10:00:00.123456Z" }));
  tables.chapters.forEach((row) => Object.assign(row, { version_number: 1, updated_at: "2026-09-16T10:00:00.123456Z" }));
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
            if (table === "book_versions") row.updated_at = `2026-09-16T11:00:00.${String(++versionRevision).padStart(6, "0")}Z`;
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
  it("does not claim an edition published immediately before the claim", async () => {
    db.state.beforeMutation = (table, operation, values) => {
      if (table !== "book_versions" || operation !== "update" || values[0]?.status !== "translating") return;
      db.tables.book_versions[1].published_at = "2026-09-16T11:00:00Z";
    };
    await expect(worker.processJob(payload, "queue-job")).rejects.toThrow();
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(db.chapterWrites()).toEqual([]);
    expect(db.tables.book_versions[1].status).toBe("draft");
  });

  it("does not claim a revision changed immediately before the claim", async () => {
    db.state.beforeMutation = (table, operation, values) => {
      if (table === "book_versions" && operation === "update" && values[0]?.status === "translating") {
        db.tables.book_versions[1].updated_at = "newer-revision";
      }
    };
    await expect(worker.processJob(payload, "queue-job")).rejects.toThrow();
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(db.chapterWrites()).toEqual([]);
  });

  it("reports partial saves honestly if the second chapter changes at its write", async () => {
    db.state.beforeMutation = (table, operation, values) => {
      if (table === "chapters" && operation === "update" && values[0]?.order === 1) {
        db.tables.chapters[3].content = "New second chapter.";
        db.tables.chapters[3].version_number = 2;
      }
    };
    await expect(worker.processJob(payload, "queue-job")).rejects.toThrow(/1 reviewed chapters were saved/);
    expect(db.tables.chapters[2].content).toBe("Reviewed Hon väntar.");
    expect(db.tables.chapters[3].content).toBe("New second chapter.");
    expect(db.tables.book_versions[1].status).toBe("failed");
    expect(db.writes.some((write) => write.values.some((row) => (row.output as Row | undefined)?.status === "checks_passed"))).toBe(false);
  });

  it("a rejected second job cannot reconcile the active job's edition", async () => {
    db.tables.book_versions[1].status = "translating";
    await worker.reconcileFailedTranslation({ data: payload, opts: { attempts: 1 }, attemptsMade: 1 } as Job, new Error("Already translating"));
    expect(db.tables.book_versions[1].status).toBe("translating");
    expect(db.writes.filter((write) => write.table === "book_versions")).toEqual([]);
  });

  it("a stale terminal job cannot fail a newer claim", async () => {
    db.tables.book_versions[1].status = "translating";
    db.tables.ai_jobs.push({ id: "old-run", kind: "translation_quality", book_version_id: "target-version", input: { reservationKey: "queue-job-attempt", targetClaimMarker: "translation-claim:old-run" } });
    await worker.reconcileFailedTranslation({ data: payload, opts: { attempts: 1 }, attemptsMade: 1 } as Job, new Error("Worker stopped"));
    expect(db.tables.book_versions[1].status).toBe("translating");
    expect(mocks.releaseBudget).not.toHaveBeenCalled();
  });

  it("does not overwrite newer job progress when an old claim loses ownership", async () => {
    mocks.profile.mockImplementation(async () => {
      db.tables.book_versions[1].updated_at = "new-job-claim";
      throw new Error("Old provider failed");
    });
    await expect(worker.processJob(payload, "queue-job")).rejects.toBeInstanceOf(worker.TranslationQualityStoppedError);
    expect(db.tables.book_versions[1].status).toBe("translating");
    expect(mocks.state.mock.calls.some(([, state]) => state.status === "failed")).toBe(false);
  });

  it("does not publish checks_passed if completion loses its claim and failure storage is down", async () => {
    db.state.beforeMutation = (table, operation, values) => {
      if (table === "book_versions" && operation === "update" && values[0]?.status === "done") {
        db.tables.book_versions[1].updated_at = "new-job-claim";
        db.state.failStatusWrites = true;
      }
    };
    await expect(worker.processJob(payload, "queue-job")).rejects.toBeInstanceOf(worker.TranslationQualityStoppedError);
    expect(db.writes.some((write) => write.values.some((row) => (row.output as Row | undefined)?.status === "checks_passed"))).toBe(false);
  });

  it.each(["before-claim", "after-claim"])("recovers a hard kill %s using only the durable job marker", async (boundary) => {
    let durableState: typeof db.tables | null = null;
    if (boundary === "before-claim") {
      db.state.beforeMutation = (table, operation, values) => {
        if (table === "book_versions" && operation === "update" && values[0]?.status === "translating") {
          durableState = structuredClone(db.tables);
          throw new Error("Simulated process loss");
        }
      };
    } else {
      mocks.state.mockImplementationOnce(async () => {
        durableState = structuredClone(db.tables);
        throw new Error("Simulated process loss");
      });
    }
    await expect(worker.processJob(payload, "queue-job-attempt")).rejects.toThrow();
    expect(durableState).not.toBeNull();
    // Only writes durable at the crash boundary survive; in-process catch did not run.
    Object.assign(db.tables, durableState);
    db.state.beforeMutation = () => {};
    await worker.reconcileFailedTranslation({ data: payload, opts: { attempts: 1 }, attemptsMade: 1 } as Job, new Error("job stalled more than allowable limit"));
    expect(db.tables.book_versions[1].status).toBe(boundary === "before-claim" ? "draft" : "failed");
    expect(String(db.tables.book_versions[1].error_message ?? "")).not.toContain("translation-claim:");
    expect(db.tables.ai_jobs[0].status).toBe("failed");
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(db.chapterWrites()).toEqual([]);
  });

  it("writes the ledger before taking the version claim and clears the marker after completion", async () => {
    await worker.processJob(payload, "queue-job-attempt");
    const ledgerIndex = db.writes.findIndex((write) => write.table === "ai_jobs" && write.operation === "insert");
    const claimIndex = db.writes.findIndex((write) => write.table === "book_versions" && write.values[0]?.status === "translating");
    expect(ledgerIndex).toBeLessThan(claimIndex);
    expect(db.writes[claimIndex].values[0].error_message).toBe((db.writes[ledgerIndex].values[0].input as Row).targetClaimMarker);
    expect(db.tables.book_versions[1].error_message).toBeNull();
  });

  it("keeps newer target text written while the AI is running", async () => {
    mocks.profile.mockImplementation(async () => {
      db.tables.chapters[2].content = "New author wording.";
      db.tables.chapters[2].version_number = 2;
      return profile;
    });
    await expect(worker.processJob(payload, "queue-job")).rejects.toBeInstanceOf(worker.TranslationQualityStoppedError);
    expect(db.tables.chapters[2].content).toBe("New author wording.");
    expect(db.chapterWrites()).toEqual([]);
    expect(db.tables.book_versions[1].status).not.toBe("done");
  });

  it("never deletes an extra chapter created during model work", async () => {
    mocks.profile.mockImplementation(async () => {
      db.tables.chapters.push({ id: "new-author-chapter", book_id: "book", book_version_id: "target-version", order: 2, title: "New chapter", content: "Keep this.", version_number: 1, updated_at: "2026-09-16T11:00:00Z" });
      return profile;
    });
    await expect(worker.processJob(payload, "queue-job")).rejects.toBeInstanceOf(worker.TranslationQualityStoppedError);
    expect(db.tables.chapters.find((row) => row.id === "new-author-chapter")?.content).toBe("Keep this.");
    expect(db.chapterWrites()).toEqual([]);
  });

  it("uses revision conditions when a target changes immediately before its update", async () => {
    db.state.beforeMutation = (table, operation) => {
      if (table !== "chapters" || operation !== "update") return;
      db.state.beforeMutation = () => {};
      db.tables.chapters[2].content = "Saved just before the update.";
      db.tables.chapters[2].version_number = 2;
    };
    await expect(worker.processJob(payload, "queue-job")).rejects.toBeInstanceOf(worker.TranslationQualityStoppedError);
    expect(db.tables.chapters[2].content).toBe("Saved just before the update.");
    expect(db.tables.book_versions[1].status).not.toBe("done");
  });

  it("does not upsert over a target chapter inserted immediately before saving", async () => {
    db.tables.chapters = db.tables.chapters.filter((row) => row.id !== "old-target-one");
    db.state.beforeMutation = (table, operation) => {
      if (table !== "chapters" || !["insert", "upsert"].includes(operation)) return;
      db.state.beforeMutation = () => {};
      db.tables.chapters.push({ id: "new-author-target", book_id: "book", book_version_id: "target-version", order: 0, title: "Author target", content: "Keep my new target.", version_number: 1, updated_at: "2026-09-16T11:00:00Z" });
    };
    await expect(worker.processJob(payload, "queue-job")).rejects.toBeInstanceOf(worker.TranslationQualityStoppedError);
    expect(db.tables.chapters.find((row) => row.id === "new-author-target")?.content).toBe("Keep my new target.");
  });

  it("does not overwrite a target version created concurrently with this job", async () => {
    db.tables.book_versions = db.tables.book_versions.filter((row) => row.id !== "target-version");
    db.tables.chapters = db.tables.chapters.filter((row) => row.book_version_id !== "target-version");
    db.state.beforeMutation = (table, operation) => {
      if (table !== "book_versions" || !["insert", "upsert"].includes(operation)) return;
      db.state.beforeMutation = () => {};
      db.tables.book_versions.push({ id: "concurrent-version", book_id: "book", language_code: "en", status: "done", visibility: "followers", published_at: "2026-09-16T12:00:00Z" });
    };
    await expect(worker.processJob({ ...payload, targetVersionId: null }, "queue-job")).rejects.toThrow();
    expect(db.tables.book_versions.find((row) => row.id === "concurrent-version")).toMatchObject({ status: "done", visibility: "followers", published_at: "2026-09-16T12:00:00Z" });
    expect(mocks.profile).not.toHaveBeenCalled();
  });

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
    expect(db.chapterWrites().some((write) => write.operation === "update")).toBe(true);
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
