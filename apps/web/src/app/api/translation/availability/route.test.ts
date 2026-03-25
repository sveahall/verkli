import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  checkRedisHealth: vi.fn(),
  getTranslationQueue: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/health/checks", () => ({
  checkRedisHealth: mocks.checkRedisHealth,
}));

vi.mock("@/lib/translation-queue", () => ({
  getTranslationQueue: mocks.getTranslationQueue,
}));

const { GET } = await import("./route");

describe("GET /api/translation/availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "author-1" },
      response: null,
    });
  });

  it("returns the auth response for unauthorized callers", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValue({
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

  it("returns available=false when Redis is unavailable", async () => {
    mocks.checkRedisHealth.mockResolvedValue(false);

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ available: false });
  });

  it("returns available=true when the translation queue responds", async () => {
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

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ available: true });
  });
});
