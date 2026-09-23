import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminRoleForApi: vi.fn(),
  createAdminClient: vi.fn(),
  getUserEmailMap: vi.fn(),
  check: vi.fn(),
}));
vi.mock("@/lib/admin-auth", () => ({ requireAdminRoleForApi: mocks.requireAdminRoleForApi }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/admin/user-emails", () => ({ getUserEmailMap: mocks.getUserEmailMap }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.check }) }));
const route = await import("./route");
const id = "00000000-0000-4000-8000-000000000001";
const row = { id, user_id: "user-1", type: "bug", message: "Cannot listen", status: "new", created_at: "2026-09-16T10:00:00Z" };
const query = {
  select: vi.fn(), order: vi.fn(), eq: vi.fn(), range: vi.fn(),
  update: vi.fn(), maybeSingle: vi.fn(),
};
const request = (params = "") => new Request(`http://localhost/api/admin/feedback${params}`);
const patch = (body: unknown = { id, status: "triaged", expectedStatus: "new" }) =>
  route.PATCH(new Request("http://localhost/api/admin/feedback", { method: "PATCH", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdminRoleForApi.mockResolvedValue({ user: { id: "admin-1" }, response: null });
  mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => query) });
  mocks.getUserEmailMap.mockResolvedValue(new Map([["user-1", "reader@example.test"]]));
  mocks.check.mockResolvedValue({ allowed: true });
  for (const method of [query.select, query.order, query.eq, query.update]) method.mockReturnValue(query);
  query.range.mockResolvedValue({ data: [row], count: 101, error: null });
  query.maybeSingle.mockResolvedValue({ data: { id, status: "triaged" }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("admin feedback access", () => {
  it.each([401, 403])("denies GET and PATCH before database access for %s", async (status) => {
    mocks.requireAdminRoleForApi.mockResolvedValue({ user: null, response: new Response(null, { status }) });
    expect((await route.GET(request())).status).toBe(status);
    expect((await patch()).status).toBe(status);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/feedback", () => {
  it("filters and pages in the database, with an exact total and stable ordering", async () => {
    const response = await route.GET(request("?status=new&page=2"));
    expect(query.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
    expect(query.eq).toHaveBeenCalledWith("status", "new");
    expect(query.order.mock.calls).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
    expect(query.range).toHaveBeenCalledWith(50, 99);
    expect(mocks.getUserEmailMap).toHaveBeenCalledWith(["user-1"]);
    expect(await response.json()).toMatchObject({ feedback: [{ ...row, auth_email: "reader@example.test" }], total: 101, page: 2, pageSize: 50 });
  });

  it("defaults to page one, bounded at 50, without a status filter", async () => {
    await route.GET(request());
    expect(query.range).toHaveBeenCalledWith(0, 49);
    expect(query.eq).not.toHaveBeenCalled();
  });

  it.each(["?page=0", "?page=-1", "?page=1.5", "?page=no", "?page=1000001", "?status=closed", "?pageSize=5000"])("rejects invalid query %s before database access", async (params) => {
    expect((await route.GET(request(params))).status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("keeps anonymous messages intact and returns unknown emails when lookup fails", async () => {
    const anonymous = { ...row, id: "anon", user_id: null, message: "Reply to: guest@example.test\nHelp" };
    query.range.mockResolvedValue({ data: [anonymous, row, row], count: 3, error: null });
    mocks.getUserEmailMap.mockRejectedValue(new Error("Auth unavailable"));
    const response = await route.GET(request());
    expect(response.status).toBe(200);
    expect(mocks.getUserEmailMap).toHaveBeenCalledWith(["user-1"]);
    expect(await response.json()).toMatchObject({ feedback: [{ ...anonymous, auth_email: null }, { auth_email: null }, { auth_email: null }] });
    expect(console.warn).toHaveBeenCalledWith("[support queue] email lookup failed", expect.any(Object));
  });

  it.each(["database", "exception"])("returns a logged failure for %s errors", async (failure) => {
    if (failure === "database") query.range.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    else mocks.createAdminClient.mockImplementation(() => { throw new Error("configuration missing"); });
    const response = await route.GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "FEEDBACK_LOAD_FAILED" });
    expect(console.error).toHaveBeenCalledWith("[support queue] load failed", expect.any(Object));
  });
});

describe("PATCH /api/admin/feedback", () => {
  it.each([
    { id, status: "closed", expectedStatus: "new" },
    { id, status: "done", expectedStatus: "closed" },
    { id, status: "done" },
    { id: "bad", status: "done", expectedStatus: "new" },
    { id, status: "done", expectedStatus: "new", message: "overwrite" },
  ])("rejects invalid status updates: %j", async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(query.update).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await route.PATCH(new Request("http://localhost/api/admin/feedback", { method: "PATCH", body: "{" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_JSON" });
  });

  it("rate limits the authenticated administrator", async () => {
    mocks.check.mockResolvedValue({ allowed: false, retryAfterSeconds: 12 });
    const response = await patch();
    expect(mocks.check).toHaveBeenCalledWith("admin-1");
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "RATE_LIMIT_EXCEEDED", retryAfterSeconds: 12 });
    expect(query.update).not.toHaveBeenCalled();
  });

  it("updates only the selected row when its status still matches", async () => {
    const response = await patch();
    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledExactlyOnceWith({ status: "triaged" });
    expect(query.eq.mock.calls).toEqual([["id", id], ["status", "new"]]);
    expect(await response.json()).toEqual({ feedback: { id, status: "triaged" } });
  });

  it("returns 409 instead of overwriting a concurrently changed row", async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: { id }, error: null });
    const response = await patch();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "FEEDBACK_STATUS_CONFLICT" });
    expect(query.update).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the row no longer exists", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await patch()).status).toBe(404);
  });

  it.each(["update", "existence", "exception"])("logs %s failures and never claims a save", async (failure) => {
    if (failure === "exception") query.maybeSingle.mockRejectedValue(new Error("network failed"));
    else if (failure === "existence") query.maybeSingle.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: { message: "lookup failed" } });
    else query.maybeSingle.mockResolvedValue({ data: null, error: { message: "update failed" } });
    const response = await patch();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "FEEDBACK_SAVE_FAILED" });
    expect(console.error).toHaveBeenCalledWith("[support queue] status update failed", expect.any(Object));
  });
});
