import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  readError: null as { code: string } | null, writeError: null as { code: string } | null, changed: false,
  eq: vi.fn(), update: vi.fn(), revoke: vi.fn(), auth: vi.fn(), billing: vi.fn(),
}));
vi.mock("@/lib/flags", () => ({ isSocialEnabled: () => true }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.auth }));
vi.mock("@/lib/billing/server", () => ({ requireProBillingForApi: mocks.billing }));
vi.mock("@/lib/social/token-crypto", () => ({ decryptToken: () => "test-only-token" }));
vi.mock("@/lib/social/oauth", () => ({ revokeToken: mocks.revoke }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => {
  let writing = false;
  const query = {
    select: () => query,
    update: (value: unknown) => { writing = true; mocks.update(value); return query; },
    eq: (key: string, value: unknown) => { mocks.eq(key, value); return query; },
    maybeSingle: async () => writing ? { data: mocks.changed ? null : { id: "connection-1" }, error: mocks.writeError } : { data: { id: "connection-1", status: "active", access_token_enc: "encrypted-test", updated_at: "2026-09-22T10:00:00Z" }, error: mocks.readError },
  }; return query;
} }) }));
const { DELETE } = await import("./route");
const run = () => DELETE(new Request("https://example.com/api/social/connections/x", { method: "DELETE" }), { params: Promise.resolve({ platform: "x" }) });
beforeEach(() => {
  vi.clearAllMocks(); Object.assign(mocks, { readError: null, writeError: null, changed: false });
  mocks.auth.mockResolvedValue({ user: { id: "owner" }, response: null }); mocks.billing.mockResolvedValue({ ok: true });
  mocks.revoke.mockResolvedValue(undefined); vi.spyOn(console, "error").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it("does not report disconnected or revoke externally if the local update fails", async () => {
  mocks.writeError = { code: "08006" };
  expect((await run()).status).toBe(500); expect(mocks.revoke).not.toHaveBeenCalled();
});
it("does not clear a concurrently replaced connection", async () => {
  mocks.changed = true; expect((await run()).status).toBe(409); expect(mocks.revoke).not.toHaveBeenCalled();
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner"); expect(mocks.eq).toHaveBeenCalledWith("updated_at", "2026-09-22T10:00:00Z");
});
it("fails a lookup error before update or external revocation", async () => {
  mocks.readError = { code: "08006" }; expect((await run()).status).toBe(500); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.revoke).not.toHaveBeenCalled();
});
it("clears local credentials and describes provider revocation without claiming confirmation", async () => {
  const res = await run(); expect(res.status).toBe(200); expect(await res.json()).toMatchObject({ status: "revoked", providerRevocation: "requested" });
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ access_token_enc: null, refresh_token_enc: null, email_config_enc: null, status: "revoked" }));
  expect(mocks.revoke).toHaveBeenCalledWith("x", "test-only-token");
});
it("keeps local disconnect honest when the platform request fails", async () => {
  mocks.revoke.mockRejectedValue(new Error("provider timeout"));
  expect(await (await run()).json()).toMatchObject({ status: "revoked", providerRevocation: "unconfirmed" });
});
it("keeps the existing author and billing gates before credential access", async () => {
  mocks.auth.mockResolvedValue({ user: null, response: new Response("", { status: 401 }) });
  expect((await run()).status).toBe(401); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.revoke).not.toHaveBeenCalled();
});
