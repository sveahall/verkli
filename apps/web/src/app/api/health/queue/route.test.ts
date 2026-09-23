import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminOrOpsForApi: vi.fn(),
  checkRedisHealth: vi.fn(),
  getTranslationQueue: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdminOrOpsForApi: mocks.requireAdminOrOpsForApi,
}));

vi.mock("@/lib/health/checks", () => ({
  checkRedisHealth: mocks.checkRedisHealth,
}));

vi.mock("@/lib/translation-queue", () => ({
  getTranslationQueue: mocks.getTranslationQueue,
}));

const { GET } = await import("./route");

describe("GET /api/health/queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminOrOpsForApi.mockResolvedValue({
      access: "admin",
      user: { id: "admin-1" },
      response: null,
    });
  });

  it("returns 401 when the caller is not authorized", async () => {
    mocks.requireAdminOrOpsForApi.mockResolvedValue({
      access: null,
      user: null,
      response: new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    });

    const res = await GET(new Request("http://localhost/api/health/queue"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "UNAUTHORIZED" });
  });

  it("returns 200 with redis=false when Redis is unavailable", async () => {
    mocks.checkRedisHealth.mockResolvedValue(false);

    const res = await GET(new Request("http://localhost/api/health/queue"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      translationQueue: false,
      redis: false,
      message: "Redis is unavailable. Start Redis to enable translation queue.",
    });
  });

  it("returns 200 with translationQueue=true when queue responds", async () => {
    mocks.checkRedisHealth.mockResolvedValue(true);
    mocks.getTranslationQueue.mockReturnValue({
      getJobCounts: vi.fn().mockResolvedValue({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      }),
    });

    const res = await GET(new Request("http://localhost/api/health/queue"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      translationQueue: true,
      redis: true,
    });
  });
});
