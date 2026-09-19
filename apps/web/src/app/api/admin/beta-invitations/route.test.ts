import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), invite: vi.fn(), list: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminRoleForApi: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/admin/beta-invitations", () => ({ inviteBetaRecipient: mocks.invite, listBetaRecipients: mocks.list }));
import { POST, GET } from "./route";
const id = "94b495df-0a8e-466d-b027-8fdb3288bc92";
const request = (body: unknown) => new Request("http://localhost/api/admin/beta-invitations", { method: "POST", body: JSON.stringify(body) });
describe("admin beta invitations", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "admin" }, response: null }); mocks.admin.mockReturnValue("db"); mocks.invite.mockResolvedValue({ accessEnabled: true, delivery: { status: "sent" } }); });
  it("blocks non-admins before accessing recipients or sending", async () => {
    mocks.auth.mockResolvedValue({ user: null, response: new Response(null, { status: 403 }) });
    expect((await POST(request({ id, source: "user" }))).status).toBe(403);
    expect((await GET(new Request("http://localhost/api/admin/beta-invitations"))).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.invite).not.toHaveBeenCalled();
  });
  it("uses only the selected ID and source, ignoring forged destination and role", async () => {
    expect((await POST(request({ id, source: "reader_waitlist", email: "attacker@example.com", audience: "author", accountExists: false }))).status).toBe(200);
    expect(mocks.invite).toHaveBeenCalledWith("db", "admin", { id, source: "reader_waitlist" });
  });
  it("rejects malformed targets without mutations", async () => {
    expect((await POST(request({ id: "no", source: "user" }))).status).toBe(400);
    expect((await POST(request({ id, source: "any" }))).status).toBe(400);
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it("surfaces failed access instead of reporting an invitation sent", async () => {
    mocks.invite.mockRejectedValue(new Error("Beta access could not be enabled."));
    expect((await POST(request({ id, source: "user" }))).status).toBe(503);
  });
});
