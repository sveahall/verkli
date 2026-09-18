import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  checkRedisHealth: vi.fn(),
  getTranslationQueue: vi.fn(),
  activation: vi.fn(),
  enabled: vi.fn(),
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

vi.mock("@/lib/translation-commit", () => ({ reviewedTranslationActivationReady: mocks.activation }));
vi.mock("@/lib/flags", () => ({ isTranslationsEnabled: mocks.enabled }));

const { GET } = await import("./route");

describe("GET /api/translation/availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activation.mockReturnValue(true);
    mocks.enabled.mockReturnValue(true);
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

  it.each(["rollout", "feature"])("does not advertise availability while %s is disabled", async (disabled) => {
    (disabled === "rollout" ? mocks.activation : mocks.enabled).mockReturnValue(false);
    mocks.checkRedisHealth.mockResolvedValue(true);
    mocks.getTranslationQueue.mockReturnValue({ getJobCounts: vi.fn().mockResolvedValue({}) });
    const res = await GET();
    await expect(res.json()).resolves.toEqual({ available: false });
    expect(mocks.checkRedisHealth).not.toHaveBeenCalled();
    expect(mocks.getTranslationQueue).not.toHaveBeenCalled();
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
