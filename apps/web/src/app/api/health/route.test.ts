import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasAdminOrOpsAccess: vi.fn(),
  checkDbHealth: vi.fn(),
  checkRedisHealth: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  hasAdminOrOpsAccess: mocks.hasAdminOrOpsAccess,
}));

vi.mock("@/lib/health/checks", () => ({
  checkDbHealth: mocks.checkDbHealth,
  checkRedisHealth: mocks.checkRedisHealth,
}));

const { GET } = await import("./route");

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a minimal public liveness payload without internal details", async () => {
    mocks.hasAdminOrOpsAccess.mockResolvedValue(false);

    const res = await GET(new Request("http://localhost/api/health"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.db).toBeUndefined();
    expect(body.redis).toBeUndefined();
    expect(mocks.checkDbHealth).not.toHaveBeenCalled();
    expect(mocks.checkRedisHealth).not.toHaveBeenCalled();
  });

  it("returns detailed health data for authorized admin or ops callers", async () => {
    mocks.hasAdminOrOpsAccess.mockResolvedValue(true);
    mocks.checkDbHealth.mockResolvedValue(true);
    mocks.checkRedisHealth.mockResolvedValue(false);

    const res = await GET(new Request("http://localhost/api/health"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({
      app: true,
      db: true,
      redis: false,
    });
  });
});
