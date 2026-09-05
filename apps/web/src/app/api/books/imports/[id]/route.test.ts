import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn(), admin: vi.fn(), enqueue: vi.fn(), queueGet: vi.fn(), queueAdd: vi.fn(), queueRemove: vi.fn() }));
vi.mock("@/lib/env", () => ({ assertPublicEnv: vi.fn(), getRedisUrl: () => "redis://synthetic", getRedisConnectionOptions: () => ({ host: "synthetic", port: 6379 }) }));
vi.mock("bullmq", () => ({ Queue: class { getJob = mocks.queueGet; add = mocks.queueAdd; close = vi.fn(); } }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.session }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/import-queue", () => ({ enqueueExtractJob: mocks.enqueue }));
import { POST } from "./route";
const author = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
let row: Record<string, unknown>;
let writes: Array<{ values: Record<string, unknown>; filters: Record<string, unknown> }>;
let claimError: boolean;
let claimThrow: boolean;
let rollbackError: boolean;
let lookupError: boolean;
let tick: number;
function query(values?: Record<string, unknown>) {
  const filters: Record<string, unknown> = {};
  const execute = async () => {
    if (!values) return { data: lookupError ? null : { ...row }, error: lookupError ? { message: "lookup failed" } : null };
    writes.push({ values, filters: { ...filters } });
    if (values.status === "pending" && claimThrow) throw new Error("synthetic rejected claim");
    if ((values.status === "pending" && claimError) || (values.status === "failed" && rollbackError)) return { data: null, error: { message: "write failed" } };
    if (!Object.entries(filters).every(([key, value]) => row[key] === value)) return { data: null, error: null };
    Object.assign(row, values, { updated_at: `trigger-${++tick}` });
    return { data: { id, updated_at: row.updated_at }, error: null };
  };
  const builder = {
    eq: (key: string, value: unknown) => { filters[key] = value; return builder; },
    select: () => builder,
    maybeSingle: execute,
    then: (resolve: (result: unknown) => void) => execute().then(resolve),
  };
  return builder;
}
const post = (importId = id) => POST(new Request(`http://localhost/api/books/imports/${importId}`, { method: "POST" }), { params: Promise.resolve({ id: importId }) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "production");
  writes = []; claimThrow = false; claimError = false; rollbackError = false; lookupError = false; tick = 0;
  row = { id, author_id: author, status: "failed", updated_at: "original-trigger", file_name: "book.TXT", file_path: `${author}/${id}.TXT`, file_storage: "supabase", mode: "new_version", book_id: null, book_version_id: null };
  mocks.auth.mockResolvedValue({ user: { id: author }, response: null });
  mocks.session.mockResolvedValue({ from: () => ({ select: () => query(), update: () => { throw new Error("Session writes forbidden"); } }) });
  mocks.admin.mockReturnValue({ from: () => ({ update: (values: Record<string, unknown>) => query(values) }) });
  mocks.enqueue.mockResolvedValue(id);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("owned import retry CAS", () => {
  it("claims an owned failed source using admin and confirms queue dispatch", async () => {
    const response = await post();
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ ok: true, id, jobId: id });
    expect(writes).toEqual([{ values: { status: "pending", progress: 0, error_message: null }, filters: { id, author_id: author, status: "failed", updated_at: "original-trigger" } }]);
    expect(mocks.enqueue).toHaveBeenCalledExactlyOnceWith({ importId: id, authorId: author, filePath: row.file_path, fileStorage: "supabase", mode: "new_version", bookId: undefined, targetVersionId: null });
  });
  it("retries the original source through the actual queue after the worker saved book/version results", async () => {
    const originalPayload = { importId: id, authorId: author, filePath: row.file_path, fileStorage: "supabase", mode: "new_version", targetVersionId: null };
    const bookId = "00000000-0000-4000-8000-000000000003";
    const versionId = "00000000-0000-4000-8000-000000000004";
    // The worker saves these pointers before inserting chapters, which may fail.
    Object.assign(row, { book_id: bookId, book_version_id: versionId });
    mocks.queueGet.mockResolvedValueOnce({ id, data: originalPayload, getState: async () => "failed", remove: mocks.queueRemove });
    mocks.queueRemove.mockResolvedValue(undefined);
    mocks.queueAdd.mockImplementation(async (_name: string, payload: Record<string, unknown>) => {
      const persisted = { id, data: payload, getState: async () => "waiting" };
      mocks.queueGet.mockResolvedValue(persisted);
      return persisted;
    });
    const actualQueue = await vi.importActual<typeof import("@/lib/import-queue")>("@/lib/import-queue");
    mocks.enqueue.mockImplementation(actualQueue.enqueueExtractJob);
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, id, jobId: id });
    expect(mocks.queueRemove).toHaveBeenCalledTimes(1);
    expect(mocks.queueAdd).toHaveBeenCalledExactlyOnceWith("extract", { ...originalPayload, bookId, targetVersionId: versionId }, { jobId: id });
    expect(mocks.queueGet).toHaveBeenCalledTimes(2);
  });
  it("allows exactly one concurrent retry of the same failed snapshot", async () => {
    const responses = await Promise.all([post(), post()]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });
  it.each([
    { file_path: "../outside.TXT" }, { author_id: "00000000-0000-4000-8000-000000000003" },
    { file_storage: "s3" }, { file_storage: "local" }, { file_name: "old.exe" },
    { file_path: `${author}/00000000-0000-4000-8000-000000000003.TXT` },
  ])("rejects unverifiable sources %j before mutation", async (overrides) => {
    Object.assign(row, overrides); const response = await post();
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ error: "IMPORT_SOURCE_INVALID" });
    expect(writes).toEqual([]); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("rejects a malformed route ID before lookup or mutation", async () => {
    const response = await post("bad"); expect(response.status).toBe(400); expect(writes).toEqual([]); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("preserves the missing-source error key", async () => {
    row.file_path = ""; const response = await post(); expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "IMPORT_MISSING_FILE_INFO" }); expect(writes).toEqual([]);
  });
  it("rejects a nonfailed import without mutation", async () => { row.status = "running"; expect((await post()).status).toBe(409); expect(writes).toEqual([]); });
  it.each(["lookup", "claim"])("returns a database error on %s failure without enqueue", async (stage) => {
    lookupError = stage === "lookup"; claimError = stage === "claim";
    const response = await post(); expect(response.status).toBe(500); expect(await response.json()).toMatchObject({ error: "DATABASE_ERROR" }); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("handles a rejected claim request without enqueue", async () => {
    claimThrow = true;
    const response = await post(); expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "DATABASE_ERROR" }); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it.each(["null", "throw"])("returns 503 and rolls back only its claim after queue %s", async (failure) => {
    if (failure === "null") mocks.enqueue.mockResolvedValue(null); else mocks.enqueue.mockRejectedValue(new Error("unavailable"));
    const response = await post(); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ error: "QUEUE_UNAVAILABLE" });
    expect(row.status).toBe("failed");
    expect(writes[1].filters).toEqual({ id, author_id: author, status: "pending", updated_at: "trigger-1" });
  });
  it("does not overwrite worker advancement after uncertain enqueue", async () => {
    mocks.enqueue.mockImplementation(async () => { Object.assign(row, { status: "extracting", progress: 30, updated_at: "worker-trigger" }); throw new Error("uncertain"); });
    expect((await post()).status).toBe(503); expect(row).toMatchObject({ status: "extracting", progress: 30, updated_at: "worker-trigger" });
  });
  it("reports queue failure even when rollback fails and logs it", async () => {
    rollbackError = true; mocks.enqueue.mockResolvedValue(null);
    expect((await post()).status).toBe(503); expect(console.error).toHaveBeenCalledWith("[import retry] rollback failed", expect.any(Object));
  });
  it("forwards authorization denial without creating clients", async () => {
    mocks.auth.mockResolvedValue({ response: new Response(null, { status: 403 }) });
    expect((await post()).status).toBe(403); expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
  });
});
