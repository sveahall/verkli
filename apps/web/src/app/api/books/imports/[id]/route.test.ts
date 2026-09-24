import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), enqueue: vi.fn(), read: vi.fn(), update: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/env", () => ({ assertPublicEnv: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/import-queue", () => ({ enqueueExtractJob: mocks.enqueue }));
import { POST } from "./route";
import { resolveErrorMessage } from "@/lib/error-messages";
const id = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-5222-a222-222222222222";
let filters: Record<string, unknown>;
const base = { id, author_id: "author", status: "failed", mode: "new_version", file_path: "synthetic.txt", file_storage: "local", book_id: "book", book_version_id: versionId };
const call = () => POST(new Request("http://localhost/api/books/imports/test", { method: "POST" }), { params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.resetAllMocks(); filters = {};
  mocks.auth.mockResolvedValue({ user: { id: "author" }, response: null });
  mocks.read.mockResolvedValue({ data: { ...base, result: { recovery: { versionId, sourceHash: "a".repeat(64) } } }, error: null });
  mocks.write.mockResolvedValue({ data: { id }, error: null });
  const update = { eq: (key: string, value: unknown) => { filters[key] = value; return update; }, select: () => update, maybeSingle: mocks.write,
    then: (resolve: (value: unknown) => unknown) => mocks.write().then(resolve) };
  mocks.update.mockReturnValue(update);
  const read = { select: () => read, eq: () => read, maybeSingle: mocks.read, update: mocks.update };
  mocks.client.mockResolvedValue({ from: () => read });
  mocks.enqueue.mockResolvedValue(id);
});
describe("import recovery retry admission", () => {
  it.each([null, {}, { recovery: null }, { recovery: { versionId: "other", sourceHash: "a".repeat(64) } }, { recovery: { versionId, sourceHash: "bad" } }])("preserves failed import without a matching receipt: %j", async result => {
    mocks.read.mockResolvedValue({ data: { ...base, result }, error: null });
    const response = await call(); const body = await response.json();
    expect(response.status).toBe(409);
    expect(body).toMatchObject({ error: "IMPORT_RECOVERY_CHECKPOINT_UNAVAILABLE", reference: id });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(resolveErrorMessage(body.error)).toContain("Contact support");
  });
  it("uses a failed-state conditional write and requeues the same identity", async () => {
    expect((await call()).status).toBe(200);
    expect(filters).toMatchObject({ id, author_id: "author", status: "failed" });
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ importId: id, targetVersionId: versionId }));
  });
  it("does not enqueue when another process already changed the failed status", async () => {
    mocks.write.mockResolvedValue({ data: null, error: null });
    expect((await call()).status).toBe(409); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("keeps fresh pending creation and overwrite outside retry admission", async () => {
    for (const change of [{ status: "pending" }, { mode: "overwrite_draft" }]) {
      mocks.read.mockResolvedValue({ data: { ...base, ...change, result: null }, error: null });
      expect((await call()).status).toBe(change.status ? 400 : 409);
    }
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it.each([401, 403])("preserves auth %s before data access", async status => {
    mocks.auth.mockResolvedValue({ user: null, response: new Response(null, { status }) });
    expect((await call()).status).toBe(status); expect(mocks.client).not.toHaveBeenCalled();
  });
});
