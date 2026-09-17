import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ queue: vi.fn(), worker: vi.fn(), heartbeat: vi.fn(), health: vi.fn(), connection: vi.fn(), auth: vi.fn(), billing: vi.fn(), limit: vi.fn(), client: vi.fn(), from: vi.fn() }));
vi.mock("bullmq", () => ({ Queue: class { constructor() { m.queue(); } getJob() { return null; } add() { return { id: "job" }; } }, Worker: class { constructor() { m.worker(); } on() { return this; } }, UnrecoverableError: class extends Error {} }));
vi.mock("@/lib/env", () => ({ assertServerEnv: vi.fn(), getRedisUrl: () => process.env.REDIS_URL, getRedisConnectionOptions: () => { m.connection(); return { host: new URL(process.env.REDIS_URL!).hostname, port: 6379 }; } }));
vi.mock("@/lib/health/worker-heartbeat", () => ({ getHeartbeats: m.health, getHeartbeatStaleMs: () => 180000, startHeartbeatInterval: m.heartbeat }));
vi.mock("@/lib/auth/require-author-marketing", () => ({ requireAuthorAndMarketingEnabled: m.auth }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: m.auth }));
vi.mock("@/lib/billing/server", () => ({ requireProBillingForApi: m.billing }));
vi.mock("@/lib/social/rate-limit", () => ({ checkPublishRateLimit: m.limit }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.client }));
vi.mock("@/lib/social/token-crypto", () => ({ decryptToken: vi.fn(), encryptToken: vi.fn() }));
vi.mock("@/lib/social/oauth", () => ({ refreshAccessToken: vi.fn() }));
vi.mock("../../../scripts/load-dotenv", () => ({}));
vi.mock("../../../scripts/sentry-worker-init", () => ({ Sentry: { captureException: vi.fn() } }));
import { enqueueSocialPublishJob } from "@/lib/social-publish-queue";
import { isCampaignPublisherReady } from "./publish-readiness";
import { POST } from "@/app/api/author/marketing/posts/[id]/publish/route";
const id = "11111111-1111-4111-8111-111111111111";
const payload = { jobId: "job", postId: id, campaignId: "", bookId: "", userId: "author", platforms: ["x"] };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("SOCIAL_MOCK_MODE", "true");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321"); vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
  m.auth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
});
afterEach(() => vi.unstubAllEnvs());
describe("local simulation transport admission", () => {
  it.each(["development", "test"])("blocks invalid endpoints at API/readiness/enqueue in %s", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    for (const [key, value] of [["SUPABASE_URL", "https://remote.invalid"], ["NEXT_PUBLIC_SUPABASE_URL", "https://remote.invalid"], ["REDIS_URL", "redis://remote.invalid:6379"], ["REDIS_URL", ""]]) {
      vi.stubEnv(key, value);
      const response = await POST(new Request("http://localhost/post", { method: "POST", body: JSON.stringify({ action: "schedule", expectedUpdatedAt: "2026-09-17T12:00:00Z" }) }), { params: Promise.resolve({ id }) });
      expect(response.status).toBe(503);
      await expect(enqueueSocialPublishJob(payload)).rejects.toThrow(/loopback/i);
      expect(await isCampaignPublisherReady()).toBe(false);
      vi.stubEnv(key, key === "REDIS_URL" ? "redis://127.0.0.1:6379" : "http://127.0.0.1:54321");
    }
    for (const spy of Object.values(m)) expect(spy).not.toHaveBeenCalled();
  });
  it.each(["development", "test"])("blocks invalid endpoints before mock Worker/heartbeat construction in %s", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    for (const [key, value] of [["SUPABASE_URL", "https://remote.invalid"], ["NEXT_PUBLIC_SUPABASE_URL", "https://remote.invalid"], ["REDIS_URL", "redis://remote.invalid:6379"], ["REDIS_URL", ""]]) {
      vi.stubEnv(key, value); vi.resetModules();
      const on = vi.spyOn(process, "on").mockImplementation(() => process);
      try { await expect(import("../../../scripts/social-publish-worker")).rejects.toThrow(/loopback/i); }
      finally { on.mockRestore(); }
      vi.stubEnv(key, key === "REDIS_URL" ? "redis://127.0.0.1:6379" : "http://127.0.0.1:54321");
    }
    for (const spy of Object.values(m)) expect(spy).not.toHaveBeenCalled();
  });
  it.each(["development", "test"])("permits a local mock Worker in %s", async environment => {
    vi.stubEnv("NODE_ENV", environment); vi.resetModules();
    const on = vi.spyOn(process, "on").mockImplementation(() => process);
    try { await import("../../../scripts/social-publish-worker"); } finally { on.mockRestore(); }
    expect(m.worker).toHaveBeenCalledOnce(); expect(m.heartbeat).toHaveBeenCalledOnce();
  });
  it("preserves remote Redis for the separate legacy nonmock worker", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SOCIAL_MOCK_MODE", "false"); vi.stubEnv("REDIS_URL", "redis://legacy.invalid:6379"); vi.resetModules();
    const on = vi.spyOn(process, "on").mockImplementation(() => process);
    try { await import("../../../scripts/social-publish-worker"); } finally { on.mockRestore(); }
    expect(m.worker).toHaveBeenCalledOnce(); expect(m.heartbeat).toHaveBeenCalledOnce(); expect(m.from).not.toHaveBeenCalled();
  });
});
