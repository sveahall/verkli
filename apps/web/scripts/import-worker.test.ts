import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), extract: vi.fn(), heartbeat: vi.fn(), enqueue: vi.fn(), language: "en" }));
vi.mock("./load-dotenv", () => ({}));
vi.mock("./sentry-worker-init", () => ({ Sentry: { captureException: vi.fn() } }));
vi.mock("../src/lib/env", () => ({ assertServerEnv: vi.fn(), getRedisConnectionOptions: () => ({ host: "127.0.0.1", port: 1 }) }));
vi.mock("../src/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("../src/lib/import-storage", () => ({ resolveLocalImportPath: () => "/synthetic/book.txt" }));
vi.mock("fs/promises", () => ({ access: async () => {} }));
vi.mock("../src/lib/import-extract", () => ({ runExtract: mocks.extract, contentHash: (text: string) => `hash:${text}`, normalizeChapterTitlesToNumericSequence: (titles: string[]) => titles }));
vi.mock("../src/lib/language-detect", () => ({
  detectLanguageFromText: () => "en",
  detectLanguageFromParts: () => mocks.language,
}));
vi.mock("../src/lib/translation-queue", () => ({ enqueueTranslationJob: mocks.enqueue }));
vi.mock("../src/lib/health/worker-heartbeat", () => ({ startHeartbeatInterval: mocks.heartbeat }));
vi.mock("bullmq", async (importOriginal) => {
  const original = await importOriginal<typeof import("bullmq")>();
  return { ...original, Worker: class { on() { return this; } } };
});
vi.stubEnv("REDIS_URL", "redis://127.0.0.1:1");
const processOn = vi.spyOn(process, "on").mockReturnValue(process);
const { processJob } = await import("./import-worker");
processOn.mockRestore();
afterAll(() => vi.unstubAllEnvs());
const payload = { importId: "import", filePath: "file", fileStorage: "local" as const, authorId: "author", bookId: "book" };
let row: { status: string; mode: string | null; author_id: string; book_version_id: string | null; result?: unknown };
let chapters: string[];
let chaptersByVersion: Map<string, string[]>;
let updates: Record<string, unknown>[];
let mutations: string[];
let failInsert: boolean;
let versions: Map<string, Record<string, unknown>>;
let failBatch: number;
let batchCalls: number;
let chapterRecords: Map<string, Record<string, unknown>[]>;
let failChapterRead: boolean;
let loseVersionAck: boolean;
let failCompletedWrite: boolean;
let missingCompletedRow: boolean;
let failVersionRead: boolean;
let beforeUpsert: ((values: Record<string, unknown>[]) => void) | undefined;
function from(table: string) {
  let action = "read"; let values: unknown; let versionFilter: string | null = null; let idFilter: string | null = null;
  let ignoreDuplicates = false;
  let excludeCompleted = false;
  const result = () => {
    if (table === "book_imports") {
      if (excludeCompleted && row.status === "completed") return { data: null, error: null };
      if (action === "update" && (values as Record<string, unknown>).status === "completed" && failCompletedWrite) {
        return { data: null, error: { message: "Synthetic completion persistence failure" } };
      }
      if (action === "update" && (values as Record<string, unknown>).status === "completed" && missingCompletedRow) return { data: null, error: null };
      if (action === "update") { updates.push(values as Record<string, unknown>); Object.assign(row, values); }
      return { data: { ...row, id: "import", book_id: "book" }, error: null };
    }
    if (table === "books") return { data: { id: "book", author_id: "author", title: "Existing title", language: "en", original_language: "en" }, error: null };
    if (table === "billing_accounts") return { data: { plan: "pro", status: "active" }, error: null };
    if (table === "book_versions") {
      if (action === "insert") {
        const value = values as Record<string, unknown>;
        const id = String(value.id ?? `new-version-${versions.size}`);
        if (versions.has(id)) return { data: null, error: { code: "23505", message: "book_versions_pkey" } };
        versions.set(id, { ...value, id, published_at: null });
        if (loseVersionAck) { loseVersionAck = false; return { data: null, error: { message: "Synthetic insert acknowledgement lost" } }; }
        return { data: versions.get(id), error: null };
      }
      return { data: versions.get(idFilter!) ?? null, error: failVersionRead ? { message: "Synthetic version read failure" } : null };
    }
    if (table === "chapters") {
      if (action === "read" && failChapterRead) return { data: null, error: { message: "Synthetic checkpoint read failure" } };
      if (action === "delete") { mutations.push("delete"); chaptersByVersion.delete(versionFilter!); chapters = [...chaptersByVersion.values()].flat(); }
      if (action === "upsert") {
        mutations.push("upsert");
        beforeUpsert?.(values as Record<string, unknown>[]);
        batchCalls++;
        if (failInsert || batchCalls === failBatch) return { data: null, error: { message: "Synthetic insertion failure" } };
        for (const chapter of values as Array<Record<string, unknown> & { book_version_id: string; source_text: string }>) {
          const records = chapterRecords.get(chapter.book_version_id) ?? [];
          const existing = records.find(record => record.order === chapter.order);
          if (!existing) records.push({ deleted_at: null, ...chapter });
          else if (!ignoreDuplicates) Object.assign(existing, chapter);
          chapterRecords.set(chapter.book_version_id, records);
          chaptersByVersion.set(chapter.book_version_id, records.map(record => String(record.source_text)));
        }
        chapters = [...chaptersByVersion.values()].flat();
      }
      const scoped = chaptersByVersion.get(versionFilter!) ?? [];
      return { data: chapterRecords.get(versionFilter!) ?? [], count: scoped.length, error: null };
    }
    throw new Error(`Unexpected table ${table}`);
  };
  const q = {
    select: () => q, eq: (column: string, value: string) => { if (column === "book_version_id") versionFilter = value; if (column === "id") idFilter = value; return q; }, neq: () => { excludeCompleted = true; return q; }, is: () => q, order: () => q, limit: () => q, not: () => q,
    update: (v: unknown) => { action = "update"; values = v; return q; },
    insert: (v: unknown) => { action = "insert"; values = v; return q; },
    upsert: (v: unknown, options?: { ignoreDuplicates?: boolean }) => { action = "upsert"; values = v; ignoreDuplicates = options?.ignoreDuplicates === true; return q; },
    delete: () => { action = "delete"; return q; },
    single: async () => result(), maybeSingle: async () => result(),
    then: (resolve: (v: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return q;
}
beforeEach(() => {
  vi.clearAllMocks();
  row = { status: "pending", mode: "overwrite_draft", author_id: "author", book_version_id: "version" };
  chapters = ["A"]; chaptersByVersion = new Map([["version", ["A"]]]); updates = []; mutations = []; failInsert = true;
  versions = new Map([["version", { id: "version", book_id: "book", language_code: "en", status: "draft", published_at: null }]]);
  failBatch = 0; batchCalls = 0;
  chapterRecords = new Map([["version", [{ order: 0, source_text: "A", content_hash: "hash:A" }]]]);
  failChapterRead = false; loseVersionAck = false; failCompletedWrite = false;
  missingCompletedRow = false; failVersionRead = false; beforeUpsert = undefined;
  mocks.language = "en"; vi.stubEnv("TRANSLATIONS_AUTO_ENQUEUE", "false");
  mocks.admin.mockReturnValue({ from });
  mocks.extract.mockResolvedValue({ title: "B", chapters: [{ title: "Chapter 1", sourceText: "B" }] });
});
describe("import writer overwrite protection", () => {
  it("preserves manuscript A when replacement B would fail during insertion", async () => {
    await processJob(payload).catch(() => {});
    expect(chapters).toEqual(["A"]);
    expect(mutations).toEqual([]);
    expect(updates.some((update) => update.status === "completed")).toBe(false);
  });
  it.each([
    { stored: "overwrite_draft", mode: "new_version", overwrite: false },
    { stored: "new_version", mode: "overwrite_draft", overwrite: false },
    { stored: null, mode: undefined, overwrite: true },
    { stored: "new_version", mode: "new_version", overwrite: true },
  ])("rejects old or conflicting overwrite signals %j before extraction", async ({ stored, mode, overwrite }) => {
    row.mode = stored;
    await expect(processJob({ ...payload, mode: mode as "new_version" | "overwrite_draft" | undefined, overwrite })).rejects.toMatchObject({ name: "UnrecoverableError", message: "IMPORT_OVERWRITE_UNAVAILABLE" });
    expect(mocks.extract).not.toHaveBeenCalled(); expect(mutations).toEqual([]); expect(chapters).toEqual(["A"]);
    expect(row.status).toBe("failed");
    expect(updates.at(-1)?.error_message).toContain("Replacing an existing draft");
  });
  it("does not treat two queued overwrite attempts as successful or lose original content", async () => {
    const results = await Promise.allSettled([processJob(payload), processJob(payload)]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(chapters).toEqual(["A"]); expect(mutations).toEqual([]);
    expect(updates.some((update) => update.status === "completed")).toBe(false);
  });
  it("allows a separate new version without deleting the original chapters", async () => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false;
    await processJob({ ...payload, mode: "new_version" });
    expect(chapters).toEqual(["A", "B"]); expect(mutations).toEqual(["upsert"]);
    expect(chaptersByVersion.get("version")).toEqual(["A"]);
    expect(chaptersByVersion.get(row.book_version_id!)).toEqual(["B"]);
    expect(row.status).toBe("completed");
  });

  it("reuses the import's version after a transient failure instead of trusting a supplied target", async () => {
    row.mode = "new_version";
    await expect(processJob({ ...payload, mode: "new_version", targetVersionId: "version" })).rejects.toThrow("Synthetic insertion failure");
    const checkpoint = row.book_version_id;
    expect(checkpoint).not.toBe("version");
    failInsert = false;
    await processJob({ ...payload, mode: "new_version" });
    expect(row.book_version_id).toBe(checkpoint);
    expect(versions.size).toBe(2);
    expect(chapters).toEqual(["A", "B"]);
  });

  it("retains committed batches on failure and completes the same version on retry", async () => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false; failBatch = 2;
    const source = Array.from({ length: 51 }, (_, index) => ({ title: `Chapter ${index + 1}`, sourceText: `B${index}` }));
    mocks.extract.mockResolvedValue({ title: "B", chapters: source });
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toThrow("Synthetic insertion failure");
    expect(chaptersByVersion.get(row.book_version_id!)).toHaveLength(50);
    await processJob({ ...payload, mode: "new_version" });
    expect(versions.size).toBe(2);
    expect(chaptersByVersion.get(row.book_version_id!)).toEqual(source.map(chapter => chapter.sourceText));
    expect(chaptersByVersion.get("version")).toEqual(["A"]);
  });

  it("recovers an acknowledged-lost version insert and concurrent retry without duplicate results", async () => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false; loseVersionAck = true;
    const outcomes = await Promise.allSettled([processJob({ ...payload, mode: "new_version" }), processJob({ ...payload, mode: "new_version" })]);
    expect(outcomes.some(outcome => outcome.status === "fulfilled")).toBe(true);
    expect(row.status).toBe("completed");
    expect(versions.size).toBe(2);
    expect(chaptersByVersion.get(row.book_version_id!)).toEqual(["B"]);
  });

  it.each(["source_text", "content", "title", "content_hash", "deleted_at"])("preserves author edits in %s when the same import is retried", async field => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false;
    await processJob({ ...payload, mode: "new_version" });
    row.status = "failed";
    const record = chapterRecords.get(row.book_version_id!)![0]; record[field] = field === "content_hash" ? null : "Author edit";
    const before = structuredClone(record); mutations.length = 0;
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toMatchObject({ name: "UnrecoverableError", message: "IMPORT_RECOVERY_CONTENT_CHANGED" });
    expect(record).toEqual(before); expect(mutations).toEqual([]);
  });

  it("fails closed on a checkpoint read error before chapter writes", async () => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false; failChapterRead = true;
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toThrow("Synthetic checkpoint read failure");
    expect(mutations).toEqual([]); expect(row.status).toBe("failed");
  });

  it("keeps identical text at different chapter orders on initial import and retry", async () => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false;
    mocks.extract.mockResolvedValue({ title: "B", chapters: [{ title: "1", sourceText: "B" }, { title: "2", sourceText: "B" }] });
    await processJob({ ...payload, mode: "new_version" });
    row.status = "failed";
    await processJob({ ...payload, mode: "new_version" });
    expect(chaptersByVersion.get(row.book_version_id!)).toEqual(["B", "B"]);
  });

  it("does not report success when the completion receipt cannot be persisted", async () => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false; failCompletedWrite = true;
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toThrow("Synthetic completion persistence failure");
    expect(row.status).toBe("failed"); failCompletedWrite = false;
    await processJob({ ...payload, mode: "new_version" });
    expect(versions.size).toBe(2); expect(chaptersByVersion.get(row.book_version_id!)).toEqual(["B"]);
  });

  it("rejects a changed unsaved tail after a partial batch", async () => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false; failBatch = 2;
    const source = Array.from({ length: 51 }, (_, index) => ({ title: `Chapter ${index + 1}`, sourceText: `B${index}` }));
    mocks.extract.mockResolvedValue({ title: "B", chapters: source });
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toThrow();
    source[50].sourceText = "Changed unsaved tail"; mutations.length = 0;
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toMatchObject({ name: "UnrecoverableError", message: "IMPORT_RECOVERY_SOURCE_CHANGED" });
    expect(mutations).toEqual([]); expect(chaptersByVersion.get(row.book_version_id!)).toHaveLength(50);
  });

  it.each([{ book_id: "another-book" }, { status: "published" }, { published_at: "2026-09-24" }])("rejects an unavailable recovery scope %j", async change => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false;
    await processJob({ ...payload, mode: "new_version" }); row.status = "failed";
    Object.assign(versions.get(row.book_version_id!)!, change); mutations.length = 0;
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toMatchObject({ name: "UnrecoverableError", message: "IMPORT_RECOVERY_VERSION_UNAVAILABLE" });
    expect(mutations).toEqual([]);
  });

  it("preserves a conflicting author row inserted after the initial read", async () => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false;
    beforeUpsert = values => {
      const first = values[0]; chapterRecords.set(String(first.book_version_id), [{ ...first, deleted_at: null, title: "Author edit" }]);
    };
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toMatchObject({ message: "IMPORT_RECOVERY_CONTENT_CHANGED" });
    expect(chapterRecords.get(row.book_version_id!)![0].title).toBe("Author edit");
  });

  it("fails closed for a missing completion row and for a version read failure", async () => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false; missingCompletedRow = true;
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toThrow("No matching import row");
    missingCompletedRow = false; failVersionRead = true; mutations.length = 0;
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toThrow("Synthetic version read failure");
    expect(mutations).toEqual([]);
  });

  it("keeps completed redelivery read-only when a chapter count fails", async () => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false;
    await processJob({ ...payload, mode: "new_version" }); failChapterRead = true; mutations.length = 0; updates.length = 0;
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toThrow("IMPORT_COMPLETION_UNVERIFIED");
    expect(mutations).toEqual([]); expect(updates).toEqual([]); expect(row.status).toBe("completed");
  });

  it("does not downgrade completed import after a downstream enqueue failure", async () => {
    row.mode = "new_version"; row.book_version_id = null; failInsert = false;
    mocks.language = "es"; vi.stubEnv("TRANSLATIONS_AUTO_ENQUEUE", "true");
    mocks.enqueue.mockRejectedValueOnce(new Error("Synthetic translation queue unavailable"));
    await expect(processJob({ ...payload, mode: "new_version" })).resolves.toBeUndefined();
    expect(row.status).toBe("completed"); expect(mocks.enqueue).toHaveBeenCalledOnce();
  });

  it("stops old failed random-version imports without creating another version", async () => {
    row.mode = "new_version"; row.status = "failed"; failInsert = false;
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toThrow("IMPORT_RECOVERY_CHECKPOINT_UNAVAILABLE");
    expect(versions.size).toBe(1); expect(mutations).toEqual([]);
  });

  it("rejects a well-shaped random-ID checkpoint even after the retry route sets pending", async () => {
    const randomId = "99999999-9999-4999-8999-999999999999";
    row.mode = "new_version"; row.status = "pending"; row.book_version_id = randomId;
    row.result = { recovery: { versionId: randomId, sourceHash: "a".repeat(64) } };
    failInsert = false;
    await expect(processJob({ ...payload, mode: "new_version", targetVersionId: randomId })).rejects.toThrow("IMPORT_RECOVERY_CHECKPOINT_UNAVAILABLE");
    expect(versions.size).toBe(1); expect(mutations).toEqual([]);
  });

  it("checks import ownership before completed deduplication or status writes", async () => {
    row.mode = "new_version"; row.status = "completed"; row.author_id = "another-author";
    await expect(processJob({ ...payload, mode: "new_version" })).rejects.toThrow("Ownership mismatch");
    expect(mutations).toEqual([]); expect(updates).toEqual([]); expect(mocks.extract).not.toHaveBeenCalled();
  });
});
