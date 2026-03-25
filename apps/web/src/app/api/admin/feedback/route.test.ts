import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminRoleForApi: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdminRoleForApi: mocks.requireAdminRoleForApi,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

const { GET } = await import("./route");

describe("GET /api/admin/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    });
  });

  it("returns 401 when no authenticated admin session exists", async () => {
    mocks.requireAdminRoleForApi.mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    });

    const res = await GET();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "UNAUTHORIZED" });
  });

  it("returns 403 for authenticated non-admin users", async () => {
    mocks.requireAdminRoleForApi.mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "FORBIDDEN" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    });

    const res = await GET();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
  });

  it("returns feedback for authenticated admins", async () => {
    mocks.requireAdminRoleForApi.mockResolvedValue({
      user: { id: "admin-1" },
      response: null,
    });

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toHaveProperty("feedback");
  });
});
