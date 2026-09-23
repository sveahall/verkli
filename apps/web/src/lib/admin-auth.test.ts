import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: (table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: mockMaybeSingle,
          })),
        })),
      };
    },
  })),
}));

const {
  hasValidOpsHealthToken,
  requireAdminRole,
  requireAdminRoleForApi,
  requireAdminOrOpsForApi,
} = await import("./admin-auth");

const originalOpsToken = process.env.OPS_HEALTH_TOKEN;
const originalHealthToken = process.env.HEALTHCHECK_TOKEN;

describe("admin auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HEALTHCHECK_TOKEN;
    process.env.OPS_HEALTH_TOKEN = "ops-secret-token";
    mockGetUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    mockMaybeSingle.mockResolvedValue({ data: { role: "admin" }, error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalOpsToken === undefined) {
      delete process.env.OPS_HEALTH_TOKEN;
    } else {
      process.env.OPS_HEALTH_TOKEN = originalOpsToken;
    }

    if (originalHealthToken === undefined) {
      delete process.env.HEALTHCHECK_TOKEN;
    } else {
      process.env.HEALTHCHECK_TOKEN = originalHealthToken;
    }

    vi.restoreAllMocks();
  });

  it("returns UNAUTHORIZED when no Supabase user is present", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(requireAdminRole()).resolves.toMatchObject({
      ok: false,
      error: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("returns FORBIDDEN when the authenticated user is not an admin", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { role: "author" }, error: null });

    await expect(requireAdminRole()).resolves.toMatchObject({
      ok: false,
      error: "FORBIDDEN",
      status: 403,
      profileRole: "author",
    });
  });

  it("returns the authenticated admin user when the profile role is admin", async () => {
    await expect(requireAdminRole()).resolves.toMatchObject({
      ok: true,
      user: { id: "admin-1" },
      profileRole: "admin",
    });
  });

  it("returns a JSON auth response for non-admin API callers", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { role: "reader" }, error: null });

    const result = await requireAdminRoleForApi();
    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(403);
    await expect(result.response?.json()).resolves.toMatchObject({
      error: "FORBIDDEN",
    });
  });

  it("accepts the dedicated ops token for internal health routes", async () => {
    const request = new Request("http://localhost/api/health/workers", {
      headers: { "x-ops-health-token": "ops-secret-token" },
    });

    expect(hasValidOpsHealthToken(request)).toBe(true);
    await expect(requireAdminOrOpsForApi(request)).resolves.toMatchObject({
      access: "ops",
      response: null,
    });
  });

  it("supports bearer token auth for internal health routes", async () => {
    const request = new Request("http://localhost/api/health/workers", {
      headers: { authorization: "Bearer ops-secret-token" },
    });

    expect(hasValidOpsHealthToken(request)).toBe(true);
  });
});
