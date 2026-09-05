import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProcessJobPayload } from "./import-worker";
const mocks = vi.hoisted(() => ({
  processor: undefined as unknown as (job: { name: string; data: ProcessJobPayload }) => Promise<void>,
  from: vi.fn(), download: vi.fn(), extract: vi.fn(), writes: vi.fn(), lookup: vi.fn(), dedupe: vi.fn(),
}));
vi.mock("node:fs/promises", async (original) => ({ ...(await original<typeof import("node:fs/promises")>()) }));
vi.mock("./load-dotenv", () => ({}));
vi.mock("./sentry-worker-init", () => ({ Sentry: { captureException: vi.fn() } }));
vi.mock("../src/lib/env", () => ({ assertServerEnv: vi.fn(), getRedisConnectionOptions: () => ({ host: "synthetic", port: 6379 }) }));
vi.mock("bullmq", () => ({
  Worker: class { constructor(_name: string, processor: typeof mocks.processor) { mocks.processor = processor; } on = vi.fn(); close = vi.fn(); },
  UnrecoverableError: class extends Error {},
}));
vi.mock("../src/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from, storage: { from: () => ({ download: mocks.download }) } }) }));
vi.mock("../src/lib/import-extract", () => ({ runExtract: mocks.extract, contentHash: vi.fn(), normalizeChapterTitlesToNumericSequence: (titles: string[]) => titles }));
vi.mock("../src/lib/translation-queue", () => ({ enqueueTranslationJob: vi.fn() }));
vi.mock("../src/lib/health/worker-heartbeat", () => ({ startHeartbeatInterval: vi.fn() }));
vi.mock("../src/lib/workers/idempotency", () => ({ isDuplicate: mocks.dedupe }));
vi.stubEnv("REDIS_URL", "redis://synthetic");
const on = vi.spyOn(process, "on").mockReturnValue(process);
await import("./import-worker");
on.mockRestore();
const author = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const key = `${author}/${id}.txt`;
const bytes = Buffer.from("Synthetic worker fixture, no real manuscript.");
let fixture: string;
let root: string;
let row: Record<string, unknown>;
let updates: Array<{ values: Record<string, unknown>; filters: Record<string, unknown> }>;
const payload = (overrides = {}): ProcessJobPayload => ({ importId: id, authorId: author, filePath: key, fileStorage: "local", ...overrides });
const processJob = (input = payload()) => mocks.processor({ name: "extract", data: input });
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  fixture = await fs.mkdtemp(path.join(os.tmpdir(), "import-worker-test-"));
  root = path.join(fixture, "imports");
  vi.stubEnv("LOCAL_IMPORTS_DIR", root);
  await fs.mkdir(path.join(root, author), { recursive: true });
  await fs.writeFile(path.join(root, key), bytes);
  row = { id, author_id: author, file_name: "source.txt", file_path: key, file_storage: "local", mode: "new_version", status: "failed", book_id: null, book_version_id: null };
  updates = [];
  mocks.from.mockImplementation((table: string) => {
    if (table !== "book_imports") throw new Error(`Unexpected table ${table}`);
    return {
      select: () => {
        const filters: Record<string, unknown> = {};
        const query = { eq: (key: string, value: unknown) => { filters[key] = value; return query; }, single: async () => {
          mocks.lookup(filters);
          return { data: Object.entries(filters).every(([key, value]) => row[key] === value) ? { ...row } : null, error: null };
        } };
        return query;
      },
      update: (values: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const query = { eq: (key: string, value: unknown) => { filters[key] = value; return query; }, then: (resolve: (result: unknown) => void) => {
          updates.push({ values, filters }); mocks.writes(values, filters); resolve({ error: null });
        } };
        return query;
      },
    };
  });
  mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  mocks.dedupe.mockResolvedValue(false);
  mocks.extract.mockImplementation(async (filePath: string) => {
    expect(await fs.readFile(filePath)).toEqual(bytes);
    expect(path.basename(filePath)).toBe("source.txt");
    expect(filePath).not.toBe(path.join(root, key));
    expect((await fs.stat(path.dirname(filePath))).mode & 0o777).toBe(0o700);
    throw new Error("Synthetic parser failure");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await fs.rm(fixture, { recursive: true, force: true }); });
describe("actual BullMQ import processor", () => {
  it("rejects a foreign owner before dedupe, I/O, extraction, or import writes", async () => {
    row.author_id = other; row.status = "completed"; row.book_version_id = other;
    const open = vi.spyOn(fs, "open");
    await expect(processJob()).rejects.toThrow();
    expect(mocks.lookup).toHaveBeenCalledWith({ id, author_id: author });
    expect(mocks.dedupe).not.toHaveBeenCalled(); expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled(); expect(updates).toEqual([]);
  });
  it("rejects malformed payload IDs before any database work", async () => {
    await expect(processJob(payload({ importId: "../bad" }))).rejects.toThrow(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(["outside", "traversal", "owner", "import", "backend", "payload"])("rejects %s source before dedupe or extraction", async (kind) => {
    if (kind === "outside") row.file_path = path.join(fixture, "outside.txt");
    if (kind === "traversal") row.file_path = `${author}/../${key}`;
    if (kind === "owner") row.file_path = `${other}/${id}.txt`;
    if (kind === "import") row.file_path = `${author}/${other}.txt`;
    if (kind === "backend") row.file_storage = "s3";
    const input = payload({ filePath: row.file_path, fileStorage: row.file_storage });
    if (kind === "payload") input.filePath = `${author}/${other}.txt`;
    await expect(processJob(input)).rejects.toThrow();
    expect(mocks.dedupe).not.toHaveBeenCalled(); expect(mocks.extract).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled(); expect(updates).toEqual([]);
  });
  it.each(["leaf", "parent"])("rejects symlink %s with zero target-byte reads", async (kind) => {
    const target = path.join(fixture, "outside"); await fs.mkdir(target);
    await fs.writeFile(path.join(target, `${id}.txt`), bytes);
    if (kind === "leaf") { await fs.unlink(path.join(root, key)); await fs.symlink(path.join(target, `${id}.txt`), path.join(root, key)); }
    else { await fs.rm(path.join(root, author), { recursive: true }); await fs.symlink(target, path.join(root, author)); }
    const open = vi.spyOn(fs, "open");
    await expect(processJob()).rejects.toThrow(); expect(open).not.toHaveBeenCalled(); expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("rejects a replaced source before the first descriptor read", async () => {
    const realOpen = fs.open; const read = vi.fn();
    vi.spyOn(fs, "open").mockImplementationOnce(async (...args) => {
      await fs.rename(path.join(root, key), path.join(fixture, "original.txt"));
      await fs.writeFile(path.join(root, key), "replacement");
      const handle = await realOpen(...args); vi.spyOn(handle, "read").mockImplementation(read); return handle;
    });
    await expect(processJob()).rejects.toThrow(); expect(read).not.toHaveBeenCalled(); expect(mocks.extract).not.toHaveBeenCalled();
  });
  it.each(["local", "supabase"] as const)("extracts a valid %s source once and cleans private files after parser failure", async (backend) => {
    row.file_storage = backend;
    await expect(processJob(payload({ fileStorage: backend }))).rejects.toThrow("Synthetic parser failure");
    expect(mocks.extract).toHaveBeenCalledTimes(1);
    await expect(fs.stat(mocks.extract.mock.calls[0][0])).rejects.toThrow();
    expect(await fs.readFile(path.join(root, key))).toEqual(bytes);
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) expect(update.filters).toEqual({ id, author_id: author });
    expect(updates.at(-1)?.values.status).toBe("failed");
    if (backend === "supabase") expect(mocks.download).toHaveBeenCalledExactlyOnceWith(key);
  });
});
