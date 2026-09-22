import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), queue: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminRoleForApi: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/queues/import-diagnostics", () => ({ loadImportQueueDiagnostic: mocks.queue }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.rate }) }));
import { GET } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const row = { id, status: "completed", progress: 100, created_at: "2026-09-22T10:00:00Z", updated_at: "2026-09-22T10:01:00Z", file_name: "private.docx", result: { manuscript: "private text" }, author_id: "private-user" };
const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
const run = (value = id) => GET(new Request(`http://localhost/api/admin/imports/${value}`), { params: Promise.resolve({ id: value }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "admin" }, response: null });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.admin.mockReturnValue({ from: () => query });
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: row, error: null });
  mocks.queue.mockResolvedValue({ availability: "available", state: "completed", attemptsMade: 1 });
});
describe("admin import diagnostics", () => {
  it.each([401, 403])("enforces %s before reading DB or Redis", async (status) => {
    mocks.auth.mockResolvedValue({ user: null, response: new Response(null, { status }) });
    expect((await run()).status).toBe(status);
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("rejects invalid IDs and throttles before reading", async () => {
    expect((await run("not-an-id")).status).toBe(400);
    mocks.rate.mockResolvedValue({ allowed: false });
    expect((await run()).status).toBe(429);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("correlates exact import and queue IDs without returning private fields", async () => {
    const response = await run();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(query.select).toHaveBeenCalledWith("id, status, progress, created_at, updated_at");
    expect(query.eq).toHaveBeenCalledWith("id", id);
    expect(mocks.queue).toHaveBeenCalledWith(id);
    const body = await response.json();
    expect(body).toEqual({ id, status: "completed", progress: 100, createdAt: row.created_at, updatedAt: row.updated_at,
      queue: { availability: "available", state: "completed", attemptsMade: 1 } });
    expect(JSON.stringify(body)).not.toContain("private");
  });
  it("distinguishes a missing import from missing queue evidence", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await run()).status).toBe(404); expect(mocks.queue).not.toHaveBeenCalled();
    query.maybeSingle.mockResolvedValue({ data: row, error: null });
    mocks.queue.mockResolvedValue({ availability: "missing", state: null, attemptsMade: null });
    expect((await run()).status).toBe(200);
  });
  it("preserves the worker's extracting status", async () => {
    query.maybeSingle.mockResolvedValue({ data: { ...row, status: "extracting", progress: 30 }, error: null });
    expect(await (await run()).json()).toMatchObject({ status: "extracting", progress: 30 });
  });
  it.each(["abcdefab-cdef-4abc-8def-abcdefabcdef", "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF"])("uses the canonical database ID for queue lookup with %s", async (reference) => {
    const canonicalId = reference.toLowerCase();
    query.maybeSingle.mockResolvedValue({ data: { ...row, id: canonicalId }, error: null });
    expect(await (await run(reference)).json()).toMatchObject({ id: canonicalId });
    expect(mocks.queue).toHaveBeenCalledWith(canonicalId);
  });
  it("does not expose unexpected status values or database error contents", async () => {
    query.maybeSingle.mockResolvedValue({ data: { ...row, status: "private text", progress: Infinity }, error: null });
    expect(await (await run()).json()).toMatchObject({ status: "unknown", progress: null });
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "private text", code: "XX" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await run();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    log.mockRestore();
  });
});
