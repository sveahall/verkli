import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminRoleForApi: mocks.admin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }));

import { PATCH } from "./route";

const APP_ID = "11111111-1111-4111-8111-111111111111";

const patch = (status: string, note?: string) =>
  PATCH(new Request("http://localhost/api/admin/beta-applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: APP_ID, status, ...(note === undefined ? {} : { note }) }),
  }));

describe("reviewing a beta application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.admin.mockResolvedValue({ response: null });
    mocks.client.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: { status: "ok", invitation: "invited" }, error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  /**
   * The decision and the invitation live in two tables. Writing them as two
   * statements left an accepted applicant blocked or a rejected one invited
   * whenever the second failed, and two concurrent reviews could settle on
   * "rejected + invited". Both now happen in one locked transaction.
   */
  it("decides the application and the invitation in a single transaction", async () => {
    const body = await (await patch("accepted")).json();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("review_beta_application", { p_id: APP_ID, p_status: "accepted", p_note: null });
    expect(body).toEqual({ ok: true, status: "accepted", invitation: { state: "invited" } });
  });

  it("passes a trimmed note through, and null when there is none", async () => {
    await patch("rejected", "  not a fit  ");
    expect(mocks.rpc).toHaveBeenCalledWith("review_beta_application", expect.objectContaining({ p_note: "not a fit" }));
    await patch("rejected", "   ");
    expect(mocks.rpc).toHaveBeenLastCalledWith("review_beta_application", expect.objectContaining({ p_note: null }));
  });

  it.each([
    ["invited", "invited"],
    ["withdrawn", "withdrawn"],
    ["already_invited", "already_invited"],
    ["not_invited", "not_invited"],
    ["no_waitlist_row", "no_waitlist_row"],
  ])("reports the invitation outcome %s so the admin is never left guessing", async (returned, expected) => {
    mocks.rpc.mockResolvedValue({ data: { status: "ok", invitation: returned }, error: null });
    expect((await (await patch("accepted")).json()).invitation).toEqual({ state: expected });
  });

  it("does not report success when the transaction failed", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "serialization failure" } });
    const response = await patch("accepted");
    expect(response.status).toBe(500);
    expect((await response.json()).ok).toBeUndefined();
  });

  it("answers 404 for an application that no longer exists", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "not_found" }, error: null });
    expect((await patch("accepted")).status).toBe(404);
  });

  it("still requires an admin and a valid status, before touching the database", async () => {
    expect((await patch("whatever")).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.admin.mockResolvedValue({ response: new Response(null, { status: 403 }) });
    expect((await patch("accepted")).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
