import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ health: vi.fn() }));
vi.mock("@/lib/health/worker-heartbeat", () => ({ getHeartbeats: mocks.health, getHeartbeatStaleMs: () => 180_000 }));
import { getMarketingQueueReadiness } from "./queue-readiness";
const fresh = { queueName: "marketing-campaign", lastSeen: "2026-09-16T12:30:00Z", stale: false, crashed: false };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-16T12:30:30Z"));
  vi.stubEnv("MARKETING_DAILY_BUDGET", "100000"); vi.stubEnv("MARKETING_JOB_CAP_UNITS", "20000");
  mocks.health.mockResolvedValue({ redis: true, heartbeats: { "marketing-campaign": fresh } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("marketing queue admission", () => {
  it("admits a fresh consumer with explicit budget limits", async () => {
    expect(await getMarketingQueueReadiness()).toEqual({ ok: true });
  });
  it.each([
    { redis: false, heartbeats: { "marketing-campaign": fresh } },
    { redis: true, heartbeats: {} },
    { redis: true, heartbeats: { "marketing-campaign": { ...fresh, lastSeen: null } } },
    { redis: true, heartbeats: { "marketing-campaign": { ...fresh, stale: true } } },
    { redis: true, heartbeats: { "marketing-campaign": { ...fresh, crashed: true } } },
    { redis: true, heartbeats: { "marketing-campaign": { ...fresh, lastSeen: "invalid" } } },
    { redis: true, heartbeats: { "marketing-campaign": { ...fresh, lastSeen: "2026-09-16T12:00:00Z" } } },
    { redis: true, heartbeats: { "marketing-campaign": { ...fresh, lastSeen: "2026-09-16T12:35:00Z" } } },
  ])("fails closed for unavailable or untrustworthy health: %j", async (health) => {
    mocks.health.mockResolvedValue(health);
    expect(await getMarketingQueueReadiness()).toMatchObject({ ok: false, code: "MARKETING_GENERATION_UNAVAILABLE" });
  });
  it("fails closed on a read exception", async () => {
    mocks.health.mockRejectedValue(new Error("Redis unavailable"));
    expect(await getMarketingQueueReadiness()).toMatchObject({ ok: false });
  });
  it("returns an unavailable result within three seconds if Redis stalls", async () => {
    mocks.health.mockReturnValue(new Promise(() => {}));
    const result = getMarketingQueueReadiness();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toMatchObject({ ok: false });
  });
  it.each(["", "0", "-1", "1.5", "Infinity", "9007199254740992"])("rejects invalid explicit caps (%s) without reading Redis", async (value) => {
    for (const key of ["MARKETING_DAILY_BUDGET", "MARKETING_JOB_CAP_UNITS"]) {
      vi.stubEnv(key, value);
      expect(await getMarketingQueueReadiness()).toMatchObject({ ok: false, code: "MARKETING_BUDGET_UNAVAILABLE" });
      vi.stubEnv(key, "100000");
    }
    expect(mocks.health).not.toHaveBeenCalled();
  });
});
