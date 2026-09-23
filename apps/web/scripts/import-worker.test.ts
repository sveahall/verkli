import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), extract: vi.fn(), heartbeat: vi.fn() }));
vi.mock("./load-dotenv", () => ({}));
vi.mock("./sentry-worker-init", () => ({ Sentry: { captureException: vi.fn() } }));
vi.mock("../src/lib/env", () => ({ assertServerEnv: vi.fn(), getRedisConnectionOptions: () => ({ host: "127.0.0.1", port: 1 }) }));
vi.mock("../src/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("../src/lib/import-storage", () => ({ resolveLocalImportPath: () => "/synthetic/book.txt" }));
vi.mock("fs/promises", () => ({ access: async () => {} }));
vi.mock("../src/lib/import-extract", () => ({ runExtract: mocks.extract, contentHash: () => "hash-b", normalizeChapterTitlesToNumericSequence: (titles: string[]) => titles }));
vi.mock("../src/lib/language-detect", () => ({ detectLanguageFromParts: () => "en" }));
vi.mock("../src/lib/translation-queue", () => ({ enqueueTranslationJob: vi.fn() }));
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
let row: { status: string; mode: string | null; author_id: string; book_version_id: string | null };
let chapters: string[];
let chaptersByVersion: Map<string, string[]>;
let updates: Record<string, unknown>[];
let mutations: string[];
let failInsert: boolean;
function from(table: string) {
  let action = "read"; let values: unknown; let versionFilter: string | null = null;
  const result = () => {
    if (table === "book_imports") {
      if (action === "update") { updates.push(values as Record<string, unknown>); Object.assign(row, values); }
      return { data: { ...row, id: "import", book_id: "book" }, error: null };
    }
    if (table === "books") return { data: { id: "book", author_id: "author", title: "Existing title", language: "en", original_language: "en" }, error: null };
    if (table === "book_versions") return { data: { id: action === "insert" ? "new-version" : "version", book_id: "book", language_code: "en", published_at: null }, error: null };
    if (table === "chapters") {
      if (action === "delete") { mutations.push("delete"); chaptersByVersion.delete(versionFilter!); chapters = [...chaptersByVersion.values()].flat(); }
      if (action === "upsert") {
        mutations.push("upsert");
        if (failInsert) return { data: null, error: { message: "Synthetic insertion failure" } };
        for (const chapter of values as Array<{ book_version_id: string; source_text: string }>) {
          const existing = chaptersByVersion.get(chapter.book_version_id) ?? [];
          chaptersByVersion.set(chapter.book_version_id, [...existing, chapter.source_text]);
        }
        chapters = [...chaptersByVersion.values()].flat();
      }
      return { data: [], count: chapters.length, error: null };
    }
    throw new Error(`Unexpected table ${table}`);
  };
  const q = {
    select: () => q, eq: (column: string, value: string) => { if (column === "book_version_id") versionFilter = value; return q; }, is: () => q, order: () => q, limit: () => q, not: () => q,
    update: (v: unknown) => { action = "update"; values = v; return q; },
    insert: (v: unknown) => { action = "insert"; values = v; return q; },
    upsert: (v: unknown) => { action = "upsert"; values = v; return q; },
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
    expect(chaptersByVersion.get("new-version")).toEqual(["B"]);
    expect(row.status).toBe("completed");
  });
});
