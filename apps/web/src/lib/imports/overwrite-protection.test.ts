import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), store: vi.fn(), enqueue: vi.fn(), attest: vi.fn(), owner: vi.fn() }));
vi.mock("@/lib/env", () => ({ assertPublicEnv: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }));
vi.mock("@/lib/import-storage", () => ({ storeImportFile: mocks.store }));
vi.mock("@/lib/import-queue", () => ({ enqueueExtractJob: mocks.enqueue }));
vi.mock("@/lib/books/service", () => ({ getBookAsOwner: mocks.owner }));
vi.mock("@/lib/imports/attestation", () => ({ enforceRightsAttestation: mocks.attest, linkRightsAttestation: vi.fn() }));
import { POST as legacy } from "@/app/api/books/import/route";
import { POST as scoped } from "@/app/api/books/[id]/import/route";
import { POST as retry } from "@/app/api/books/imports/[id]/route";
import { startScopedBookImport } from "./scoped-import";
const id = "11111111-1111-4111-8111-111111111111";
const write = vi.fn();
const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), insert: write, update: write };
const client = { from: vi.fn(() => query) };
function request(fields: Record<string, string>) {
  const form = new FormData(); form.set("file", new File(["new content"], "book.txt"));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("http://localhost/api/books/import", { method: "POST", body: form });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner" }, response: null });
  mocks.client.mockResolvedValue(client); mocks.owner.mockResolvedValue({ ok: true, data: { id } });
  mocks.attest.mockResolvedValue({ ok: true, attestationId: "attestation" });
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { id, author_id: "owner", mode: "overwrite_draft", status: "failed", file_path: "file", file_storage: "local" }, error: null });
  write.mockReturnValue({ select: () => ({ single: async () => ({ data: null, error: { message: "Write attempted" } }) }), eq: () => query });
});
describe("overwrite import protection", () => {
  it.each<Record<string, string>>([{ mode: "overwrite_draft" }, { overwrite: "true" }, { overwrite: "1" }])("rejects legacy entry %j before durable side effects", async (fields) => {
    const response = await legacy(request(fields));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "IMPORT_OVERWRITE_UNAVAILABLE" });
    expect(mocks.attest).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("rejects scoped entry without starting an import", async () => {
    const response = await scoped(request({ mode: "overwrite_draft" }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(409); expect(write).not.toHaveBeenCalled(); expect(mocks.attest).not.toHaveBeenCalled();
  });
  it("rejects direct helper callers before storage or queue writes", async () => {
    const result = await startScopedBookImport({ supabase: client as never, userId: "owner", bookId: id, file: new File(["B"], "b.txt"), mode: "overwrite_draft", targetVersionId: null });
    expect(result).toMatchObject({ ok: false, status: 409, errorKey: "IMPORT_OVERWRITE_UNAVAILABLE" });
    expect(write).not.toHaveBeenCalled(); expect(mocks.store).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("does not reset or enqueue a failed overwrite on retry", async () => {
    const response = await retry(new Request("http://localhost"), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(409); expect(write).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it.each([401, 403])("preserves auth %s before reading or writing", async (status) => {
    mocks.auth.mockResolvedValue({ user: null, response: new Response(null, { status }) });
    expect((await legacy(request({ mode: "overwrite_draft" }))).status).toBe(status);
    expect((await retry(new Request("http://localhost"), { params: Promise.resolve({ id }) })).status).toBe(status);
    expect(client.from).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
});
