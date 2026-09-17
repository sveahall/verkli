import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalCampaignSimulation, changePostDelivery, consumePostDelivery } from "./post-delivery";
import type { createAdminClient } from "@/lib/supabase/admin";
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
});
afterEach(() => vi.unstubAllEnvs());
describe("campaign delivery simulation boundary", () => {
  it.each(["development", "test"])("blocks remote or absent services before DB access in %s", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    const from = vi.fn(() => { throw new Error("DB sentinel reached"); });
    const client = { from } as unknown as ReturnType<typeof createAdminClient>;
    const enqueue = vi.fn();
    for (const [key, value] of [["SUPABASE_URL", "https://remote.invalid"], ["NEXT_PUBLIC_SUPABASE_URL", "https://remote.invalid"], ["REDIS_URL", "redis://remote.invalid:6379"], ["REDIS_URL", ""], ["REDIS_URL", "https://localhost:6379"], ["SUPABASE_URL", "http://localhost@remote.invalid"]]) {
      vi.stubEnv(key, value);
      await expect(changePostDelivery({ client, postId: "post", userId: "author", expectedUpdatedAt: "revision", action: "schedule", simulated: true, enqueue })).rejects.toThrow(/loopback/i);
      await expect(consumePostDelivery({ client, postId: "post", userId: "author", jobId: "job", simulated: true })).rejects.toThrow(/loopback/i);
      vi.stubEnv(key, key === "REDIS_URL" ? "redis://127.0.0.1:6379" : "http://127.0.0.1:54321");
    }
    vi.stubEnv("SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => assertLocalCampaignSimulation(true)).toThrow(/loopback/i);
    expect(from).not.toHaveBeenCalled(); expect(enqueue).not.toHaveBeenCalled();
  });
  it.each(["development", "test"])("accepts explicit loopback settings in %s", environment => {
    vi.stubEnv("NODE_ENV", environment);
    expect(() => assertLocalCampaignSimulation(true)).not.toThrow();
  });
  it.each(["localhost", "127.0.0.1", "[::1]"])("accepts %s loopback URLs", host => {
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("SUPABASE_URL", `http://${host}:54321`); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `http://${host}:54321`); vi.stubEnv("REDIS_URL", `redis://${host}:6379`);
    expect(() => assertLocalCampaignSimulation(true)).not.toThrow();
  });
  it("denies a remote database even in development simulation", () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("SUPABASE_URL", "https://remote.supabase.co");
    expect(() => assertLocalCampaignSimulation(true)).toThrow(/Remote databases are not allowed/);
  });
  it.each([["production", true], ["production", false], ["development", false], ["test", false]])("denies %s / simulated=%s before accessing even forged metadata", async (environment, simulated) => {
    vi.stubEnv("NODE_ENV", String(environment));
    const from = vi.fn(() => { throw new Error("Untrusted database must not be accessed"); });
    const client = { from } as unknown as ReturnType<typeof createAdminClient>;
    const enqueue = vi.fn(); const publish = vi.fn(); const prepare = vi.fn();
    await expect(changePostDelivery({ client, postId: "forged-post", userId: "forged-owner", expectedUpdatedAt: "forged-revision", action: "schedule", simulated: Boolean(simulated), enqueue })).rejects.toThrow(/local development simulation/i);
    const forgedPayload = { client, postId: "forged-post", userId: "forged-owner", jobId: "forged-job", simulated: Boolean(simulated), publish, prepare };
    await expect(consumePostDelivery(forgedPayload)).rejects.toThrow(/local development simulation/i);
    expect(from).not.toHaveBeenCalled(); expect(enqueue).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
  });
});
