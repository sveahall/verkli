import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), store: vi.fn(), enqueue: vi.fn(), insert: vi.fn(), update: vi.fn(), book: vi.fn(), version: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/import-storage", () => ({ storeImportFile: mocks.store }));
vi.mock("@/lib/import-queue", () => ({ enqueueExtractJob: mocks.enqueue }));
import { startScopedBookImport } from "./scoped-import";
const author = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const book = "00000000-0000-4000-8000-000000000003";
const version = "00000000-0000-4000-8000-000000000004";
let row: Record<string, unknown>;
let sourceError: boolean;
let sourceMissing: boolean;
let updateError: boolean;
let writes: Array<{ values: Record<string, unknown>; filters: Record<string, unknown> }>;
const session = { from: (table: string) => {
  if (table === "book_imports") throw new Error("Session import writes forbidden");
  return { select: () => ({ eq: () => ({ maybeSingle: table === "books" ? mocks.book : mocks.version }) }) };
} };
const args = () => ({ supabase: session as unknown as Parameters<typeof startScopedBookImport>[0]["supabase"], userId: author, bookId: book, file: new File(["Synthetic scoped source"], "manuscript.TXT"), mode: "new_version" as const, targetVersionId: null });
beforeEach(() => {
  vi.resetAllMocks(); row = {}; writes = []; sourceError = false; sourceMissing = false; updateError = false;
  mocks.book.mockResolvedValue({ data: { id: book, author_id: author }, error: null });
  mocks.version.mockResolvedValue({ data: { id: version, book_id: book, published_at: null }, error: null });
  mocks.insert.mockImplementation((values: Record<string, unknown>) => ({ select: () => ({ single: async () => { row = { ...values, id }; return { data: { id }, error: null }; } }) }));
  mocks.update.mockImplementation((values: Record<string, unknown>) => {
    const filters: Record<string, unknown> = {};
    const execute = async () => {
      writes.push({ values, filters });
      if ((values.file_path && sourceError) || updateError) return { data: null, error: { message: "synthetic database failure" } };
      if ((values.file_path && sourceMissing) || !Object.entries(filters).every(([key, value]) => row[key] === value)) return { data: null, error: null };
      Object.assign(row, values); return { data: { id }, error: null };
    };
    const q = { eq: (key: string, value: unknown) => { filters[key] = value; return q; }, select: () => q, maybeSingle: execute, then: (resolve: (result: unknown) => void) => execute().then(resolve) };
    return q;
  });
  mocks.admin.mockReturnValue({ from: (table: string) => { if (table !== "book_imports") throw new Error("Unexpected admin table"); return { insert: mocks.insert, update: mocks.update }; } });
  mocks.store.mockResolvedValue({ ok: true, filePath: `${author}/${id}.TXT`, fileStorage: "supabase" });
  mocks.enqueue.mockResolvedValue(id);
  vi.spyOn(console, "error").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("actual scoped import service", () => {
  it("uses the inserted UUID, guards the initial source write, and enqueues once", async () => {
    expect(await startScopedBookImport(args())).toMatchObject({ ok: true, importId: id, jobId: id });
    expect(mocks.store).toHaveBeenCalledExactlyOnceWith(author, id, "manuscript.TXT", Buffer.from("Synthetic scoped source"));
    expect(writes[0].filters).toEqual({ id, author_id: author, file_path: "" });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.update.mock.invocationCallOrder[0]);
  });
  it("denies a foreign book before any admin import write", async () => {
    mocks.book.mockResolvedValue({ data: { id: book, author_id: "foreign" }, error: null });
    expect(await startScopedBookImport(args())).toMatchObject({ ok: false, status: 404 });
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.store).not.toHaveBeenCalled();
  });
  it.each(["foreign", "published"])("denies a %s version before admin writes", async (kind) => {
    mocks.version.mockResolvedValue({ data: { id: version, book_id: kind === "foreign" ? "other" : book, published_at: kind === "published" ? "2025-01-01" : null }, error: null });
    expect(await startScopedBookImport({ ...args(), mode: "overwrite_draft", targetVersionId: version })).toMatchObject({ ok: false, errorKey: "INVALID_BOOK_VERSION" });
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.store).not.toHaveBeenCalled();
  });
  it.each(["error", "no-row"])("does not enqueue when source update returns %s", async (failure) => {
    sourceError = failure === "error"; sourceMissing = failure === "no-row";
    expect(await startScopedBookImport(args())).toMatchObject({ ok: false, status: 500 });
    expect(mocks.enqueue).not.toHaveBeenCalled(); expect(console.error).toHaveBeenCalled();
  });
  it.each(["null", "throw"])("reports queue %s as 503 and marks the owned import failed", async (failure) => {
    if (failure === "null") mocks.enqueue.mockResolvedValue(null); else mocks.enqueue.mockRejectedValue(new Error("synthetic queue failure"));
    expect(await startScopedBookImport(args())).toMatchObject({ ok: false, status: 503, errorKey: "QUEUE_UNAVAILABLE" });
    expect(row.status).toBe("failed"); expect(writes.at(-1)?.filters).toMatchObject({ id, author_id: author });
  });
  it("reports rejected insert requests without calling storage", async () => {
    mocks.insert.mockReturnValue({ select: () => ({ single: async () => { throw new Error("synthetic rejected insert"); } }) });
    expect(await startScopedBookImport(args())).toMatchObject({ ok: false, status: 500, errorKey: "IMPORT_RECORD_CREATION_FAILED" });
    expect(mocks.store).not.toHaveBeenCalled(); expect(console.error).toHaveBeenCalled();
  });
  it("reports rejected source requests without enqueue", async () => {
    mocks.update.mockReturnValueOnce({ eq: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => { throw new Error("synthetic rejected source write"); } }) }) }) }) });
    expect(await startScopedBookImport(args())).toMatchObject({ ok: false, status: 500 });
    expect(mocks.enqueue).not.toHaveBeenCalled(); expect(console.error).toHaveBeenCalled();
  });
  it("handles storage and failure-write errors without enqueue", async () => {
    mocks.store.mockResolvedValue({ ok: false, error: "storage unavailable" }); updateError = true;
    expect(await startScopedBookImport(args())).toMatchObject({ ok: false, errorKey: "IMPORT_FILE_STORAGE_FAILED" });
    expect(mocks.enqueue).not.toHaveBeenCalled(); expect(console.error).toHaveBeenCalled();
  });
});
