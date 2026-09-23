import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminRoleForApi: mocks.admin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }));

import { PATCH } from "./route";

const APP_ID = "11111111-1111-4111-8111-111111111111";
const WAITLIST_ID = "22222222-2222-4222-8222-222222222222";

type Options = { waitlistId?: string | null; invitedAt?: string | null; writeFails?: boolean; readFails?: boolean };

function database(options: Options = {}) {
  const waitlistWrites: unknown[] = [];
  const client = {
    from(table: string) {
      if (table === "beta_applications") {
        const chain = {
          update: () => chain,
          eq: () => chain,
          select: () => chain,
          maybeSingle: async () => ({
            data: { waitlist_id: options.waitlistId === undefined ? WAITLIST_ID : options.waitlistId },
            error: null,
          }),
        };
        return chain;
      }
      if (table === "waitlist") {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.update = (payload: unknown) => { waitlistWrites.push(payload); return chain; };
        chain.eq = () => chain;
        chain.maybeSingle = async () => options.readFails
          ? { data: null, error: { code: "PGRST301" } }
          : { data: { beta_invited_at: options.invitedAt ?? null }, error: null };
        chain.then = (resolve: (v: unknown) => void) =>
          Promise.resolve({ error: options.writeFails ? { code: "boom" } : null }).then(resolve);
        return chain;
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  mocks.client.mockReturnValue(client);
  return { waitlistWrites };
}

const patch = (status: string) =>
  PATCH(new Request("http://localhost/api/admin/beta-applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: APP_ID, status }),
  }));

describe("reviewing a beta application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.admin.mockResolvedValue({ response: null });
  });
  afterEach(() => vi.restoreAllMocks());

  /**
   * Accepting used to write a label and nothing else. Most applicants have no
   * account yet, so `user_flags.beta_enabled` cannot be granted to them — the
   * waitlist is the only place an invitation can exist before an account does,
   * and `beta_invited_at` is what authorises the first verified signup.
   */
  it("accepting invites the linked waitlist entry", async () => {
    const db = database();
    const body = await (await patch("accepted")).json();
    expect(body).toMatchObject({ ok: true, status: "accepted", invitation: { state: "invited" } });
    expect(db.waitlistWrites).toHaveLength(1);
    expect(db.waitlistWrites[0]).toMatchObject({ beta_invited_at: expect.any(String) });
  });

  it("rejecting withdraws the invitation, so a mistaken accept cannot let a stranger in", async () => {
    const db = database({ invitedAt: "2026-09-23T10:00:00.000Z" });
    const body = await (await patch("rejected")).json();
    expect(body.invitation).toEqual({ state: "withdrawn" });
    expect(db.waitlistWrites[0]).toEqual({ beta_invited_at: null });
  });

  it("writes nothing when the invitation already matches the decision", async () => {
    const already = database({ invitedAt: "2026-09-23T10:00:00.000Z" });
    expect((await (await patch("accepted")).json()).invitation).toEqual({ state: "already_invited" });
    expect(already.waitlistWrites).toHaveLength(0);

    const never = database();
    expect((await (await patch("rejected")).json()).invitation).toEqual({ state: "not_invited" });
    expect(never.waitlistWrites).toHaveLength(0);
  });

  it("says so rather than silently doing nothing when no waitlist entry is linked", async () => {
    const db = database({ waitlistId: null });
    expect((await (await patch("accepted")).json()).invitation).toEqual({ state: "no_waitlist_row" });
    expect(db.waitlistWrites).toHaveLength(0);
  });

  it("reports a failed invitation instead of letting the admin assume it landed", async () => {
    database({ writeFails: true });
    expect((await (await patch("accepted")).json()).invitation).toEqual({ state: "failed" });
    database({ readFails: true });
    expect((await (await patch("accepted")).json()).invitation).toEqual({ state: "failed" });
  });

  it("still requires an admin and a valid status", async () => {
    database();
    expect((await patch("whatever")).status).toBe(400);
    mocks.admin.mockResolvedValue({ response: new Response(null, { status: 403 }) });
    expect((await patch("accepted")).status).toBe(403);
  });
});
