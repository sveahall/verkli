import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRedisHealth: vi.fn(),
  getTranslationQueue: vi.fn(),
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
  });

  it("returns 200 with redis=false when Redis is unavailable", async () => {
    mocks.checkRedisHealth.mockResolvedValue(false);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      translationQueue: false,
      redis: false,
      message: "Redis is unavailable. Start Redis to enable translation queue.",
    });
  });

  it("returns 200 with translationQueue=false when queue is unavailable", async () => {
    mocks.checkRedisHealth.mockResolvedValue(true);
    mocks.getTranslationQueue.mockReturnValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      translationQueue: false,
      redis: true,
      message: "Translation queue is unavailable.",
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

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      translationQueue: true,
      redis: true,
    });
  });
});
