import { afterEach, describe, expect, it, vi } from "vitest";
import { assertLocalCampaignSimulation, changePostDelivery, consumePostDelivery } from "./post-delivery";
import type { createAdminClient } from "@/lib/supabase/admin";
afterEach(() => vi.unstubAllEnvs());
describe("campaign delivery simulation boundary", () => {
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
