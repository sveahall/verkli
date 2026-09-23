import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The failure this guards: the beta column was read from
 * `profiles.preferences.beta_enabled`, while the grant path — this route's own
 * PATCH, `grantBetaAccessIfInvited`, and the admin toggle — all write
 * `user_flags.beta_enabled`. Nothing in the tree has ever written the
 * preferences field, so the list rendered "Disabled" for every user however
 * many authors had been let in. Access worked; the only view of the cohort did
 * not. That is the one screen launch day depends on.
 */

const mocks = vi.hoisted(() => ({
  requireAdminRoleForApi: vi.fn(),
  getUserEmailMap: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdminRoleForApi: mocks.requireAdminRoleForApi,
}));
vi.mock("@/lib/admin/user-emails", () => ({ getUserEmailMap: mocks.getUserEmailMap }));
vi.mock("@/lib/analytics/events", () => ({ logAnalyticsEvent: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));

import { GET } from "./route";

/** One profile row, and a user_flags table the test controls. */
function stubTables(flagRows: unknown[] | null, flagError: { message: string } | null = null) {
  mocks.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      const q: Record<string, unknown> = {
        select: () => q,
        order: () => q,
        or: () => q,
        range: () =>
          Promise.resolve({
            data: [
              { user_id: "granted-1", role: "author", display_name: "A", username: "a", created_at: "2026-01-01" },
              { user_id: "plain-2", role: "reader", display_name: "B", username: "b", created_at: "2026-01-02" },
            ],
            error: null,
            count: 2,
          }),
      };
      return q;
    }
    const q: Record<string, unknown> = {
      select: () => q,
      in: () => Promise.resolve({ data: flagRows, error: flagError }),
    };
    return q;
  });
}

describe("GET /api/admin/users — beta column", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminRoleForApi.mockResolvedValue({ response: null, user: { id: "admin" } });
    mocks.getUserEmailMap.mockResolvedValue(new Map());
  });

  it("reports a granted author as enabled, reading the table the grant actually writes", async () => {
    stubTables([
      { user_id: "granted-1", beta_enabled: true },
      { user_id: "plain-2", beta_enabled: false },
    ]);

    const body = await (await GET(new Request("http://localhost/api/admin/users"))).json();

    // Reading profiles.preferences instead would make both of these false.
    expect(body.users.find((u: { user_id: string }) => u.user_id === "granted-1").beta_enabled).toBe(true);
    expect(body.users.find((u: { user_id: string }) => u.user_id === "plain-2").beta_enabled).toBe(false);
    expect(mocks.from).toHaveBeenCalledWith("user_flags");
  });

  it("fails loudly when the flag read errors instead of showing everyone as disabled", async () => {
    stubTables(null, { message: "connection reset" });

    const response = await GET(new Request("http://localhost/api/admin/users"));

    expect(response.status).toBe(500);
  });
});
