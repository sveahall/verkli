import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ health: vi.fn() }));
vi.mock("@/lib/health/worker-heartbeat", () => ({ getHeartbeats: m.health, getHeartbeatStaleMs: () => 180_000 }));
import { isCampaignPublisherReady } from "./publish-readiness";
import { QUEUE_NAMES } from "@/lib/queue-names";
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());
describe("local campaign publisher admission", () => {
  it("requires Redis and a fresh noncrashed consumer", async () => {
    m.health.mockResolvedValue({ redis: true, heartbeats: { [QUEUE_NAMES.SOCIAL_PUBLISH]: { lastSeen: new Date().toISOString(), stale: false, crashed: false } } });
    expect(await isCampaignPublisherReady()).toBe(true);
  });
  it.each([
    { redis: false, heartbeats: {} },
    { redis: true, heartbeats: {} },
    { redis: true, heartbeats: { [QUEUE_NAMES.SOCIAL_PUBLISH]: { lastSeen: "invalid", stale: false, crashed: false } } },
    { redis: true, heartbeats: { [QUEUE_NAMES.SOCIAL_PUBLISH]: { lastSeen: "2020-01-01T00:00:00Z", stale: false, crashed: false } } },
    { redis: true, heartbeats: { [QUEUE_NAMES.SOCIAL_PUBLISH]: { lastSeen: "2099-01-01T00:00:00Z", stale: false, crashed: false } } },
  ])("rejects missing or invalid consumer evidence: %j", async health => {
    m.health.mockResolvedValue(health);
    expect(await isCampaignPublisherReady()).toBe(false);
  });
  it("fails closed on a health read error or timeout", async () => {
    m.health.mockRejectedValueOnce(new Error("Redis unavailable"));
    expect(await isCampaignPublisherReady()).toBe(false);
    vi.useFakeTimers(); m.health.mockReturnValueOnce(new Promise(() => {}));
    const result = isCampaignPublisherReady(); await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toBe(false);
  });
});
