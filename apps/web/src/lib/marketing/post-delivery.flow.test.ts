import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), fetch: vi.fn(), queued: [] as Array<{ data: Record<string, unknown>; options: { delay: number } }>, processor: null as null | ((job: unknown) => Promise<void>), ready: true, social: true, pro: true, allowed: true, queueFail: false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: m.from }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: m.from }) }));
vi.mock("@/lib/auth/require-author-marketing", () => ({ requireAuthorAndMarketingEnabled: async () => ({ user: { id: "author" }, response: null }) }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: async () => ({ user: { id: "author" }, response: null }) }));
vi.mock("@/lib/billing/server", () => ({ requireProBillingForApi: async () => m.pro ? { ok: true } : { ok: false, response: new Response(null, { status: 402 }) } }));
vi.mock("@/lib/flags", () => ({ isSocialEnabled: () => m.social }));
vi.mock("@/lib/social/rate-limit", () => ({ checkPublishRateLimit: async () => ({ allowed: m.allowed }) }));
vi.mock("@/lib/marketing/publish-readiness", () => ({ isCampaignPublisherReady: async () => m.ready }));
vi.mock("@/lib/env", () => ({ assertServerEnv: vi.fn(), getRedisConnectionOptions: () => ({ host: "localhost", port: 6379 }), getRedisUrl: () => "redis://localhost:6379" }));
vi.mock("@/lib/health/worker-heartbeat", () => ({ startHeartbeatInterval: vi.fn() }));
vi.mock("@/lib/social/token-crypto", () => ({ decryptToken: () => "local-test-token", encryptToken: () => "encrypted" }));
vi.mock("@/lib/social/oauth", () => ({ refreshAccessToken: vi.fn() }));
vi.mock("../../../scripts/load-dotenv", () => ({}));
vi.mock("../../../scripts/sentry-worker-init", () => ({ Sentry: { captureException: vi.fn() } }));
vi.mock("bullmq", () => ({
  Queue: class {
    getJob() { return null; }
    add(_name: string, data: Record<string, unknown>, options: { delay: number }) { if (m.queueFail) throw new Error("Local queue failure"); m.queued.push({ data, options }); return { id: data.jobId }; }
  },
  Worker: class { constructor(_name: string, processor: typeof m.processor) { m.processor = processor; } on() { return this; } },
  UnrecoverableError: class extends Error {},
}));
import { PATCH } from "@/app/api/author/marketing/posts/[id]/route";
import { POST } from "@/app/api/author/marketing/posts/[id]/publish/route";
const id = "11111111-1111-4111-8111-111111111111";
let post: Record<string, unknown>;
let tick: number;
let connected: boolean;
let failReceipt: boolean;
const delivery = () => (post.metadata as { delivery: Record<string, unknown> }).delivery;
const request = (body: object) => new Request("http://localhost/api/post", { method: "POST", body: JSON.stringify({ expectedUpdatedAt: post.updated_at, ...body }) });
const params = { params: Promise.resolve({ id }) };
const schedule = () => POST(request({ action: "schedule", scheduledFor: new Date(Date.now() + 60_000).toISOString() }), params);
const run = async () => { vi.setSystemTime(Date.now() + 120_000); await m.processor!({ name: "publish", data: m.queued.at(-1)!.data }); };
beforeEach(async () => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-17T12:00:00Z")); tick = Date.now(); connected = true; failReceipt = false;
  m.queued = []; m.queueFail = false; m.ready = true; m.social = true; m.pro = true; m.allowed = true;
  post = { id, book_id: "book", author_id: "author", status: "draft", channel: "x", content_type: "text", caption: "Original draft", hashtags: "#book", cta: "Read now", share_url: null, metadata: {}, updated_at: new Date(tick).toISOString() };
  m.from.mockImplementation((table: string) => {
    let update: Record<string, unknown> | undefined;
    const filters: Array<[string, unknown]> = [];
    const result = () => {
      const row = table === "books" ? { id: "book", author_id: "author" } : table === "social_connections" ? { user_id: "author", platform: "x", status: connected ? "active" : "expired", access_token_enc: "encrypted" } : post;
      if (!filters.every(([key, value]) => row[key as keyof typeof row] === value)) return { data: null, error: null };
      if (update && failReceipt && (update.metadata as { delivery?: { state?: string } })?.delivery?.state === "simulated") return { data: null, error: { message: "receipt write unavailable" } };
      if (update) post = { ...post, ...update, updated_at: new Date(++tick).toISOString() };
      return { data: structuredClone(table === "marketing_posts" ? post : row), error: null };
    };
    const q = { select: () => q, eq: (key: string, value: unknown) => { filters.push([key, value]); return q; }, update: (value: Record<string, unknown>) => { update = value; return q; }, maybeSingle: async () => result(), single: async () => result(), then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
    return q;
  });
  vi.stubGlobal("fetch", m.fetch);
  m.fetch.mockImplementation(async () => new Response(JSON.stringify({ data: { id: "controlled-receipt" } }), { status: 200 }));
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("REDIS_URL", "redis://localhost:6379"); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("SOCIAL_MOCK_MODE", "true");
  vi.resetModules();
  const on = vi.spyOn(process, "on").mockImplementation(() => process);
  await import("../../../scripts/social-publish-worker"); on.mockRestore();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("local approval → API → publishing queue → real consumer simulation", () => {
  it("consumes exactly the approved version once and persists a simulated receipt", async () => {
    const oldRevision = post.updated_at;
    expect((await PATCH(request({ caption: "Reviewed version B", status: "ready" }), params)).status).toBe(200);
    expect((await POST(request({ expectedUpdatedAt: oldRevision, action: "schedule", scheduledFor: new Date(Date.now() + 60_000).toISOString() }), params)).status).toBe(409);
    expect((await schedule()).status).toBe(202);
    expect(m.queued[0].options.delay).toBe(60_000);
    expect((await PATCH(request({ caption: "Later version C" }), params)).status).toBe(409);
    await run(); const revision = post.updated_at; await run();
    expect(post.updated_at).toBe(revision);
    expect(m.fetch).not.toHaveBeenCalled();
    expect(delivery()).toMatchObject({ state: "simulated", text: "Reviewed version B\n\n#book\n\nRead now", simulated: true });
    expect(post.status).toBe("ready"); expect(post.posted_url).toBeUndefined();
  });
  it("stops a scheduled job even with social, billing and health unavailable", async () => {
    await PATCH(request({ status: "ready" }), params); await schedule();
    m.social = false; m.pro = false; m.ready = false; m.allowed = false;
    expect((await POST(request({ action: "cancel" }), params)).status).toBe(200);
    await run(); expect(delivery().state).toBe("cancelled"); expect(m.fetch).not.toHaveBeenCalled();
  });
  it("surfaces queue failure and retries the same approved version without duplicate simulation", async () => {
    await PATCH(request({ status: "ready" }), params); m.queueFail = true;
    expect((await schedule()).status).toBe(503); expect(delivery().state).toBe("failed");
    const jobId = delivery().jobId; m.queueFail = false;
    expect((await POST(request({ action: "retry" }), params)).status).toBe(202);
    await run(); const revision = post.updated_at; await run();
    expect(post.updated_at).toBe(revision); expect(delivery().jobId).toBe(jobId); expect(delivery().state).toBe("simulated"); expect(m.fetch).not.toHaveBeenCalled();
  });
  it("recovers a failed final save through the owner API without readmission or a new job", async () => {
    await PATCH(request({ status: "ready" }), params); await schedule(); failReceipt = true;
    await expect(run()).rejects.toThrow(/save/i); expect(delivery().state).toBe("processing");
    failReceipt = false; m.pro = false; m.ready = false; m.allowed = false; m.social = false;
    const jobId = delivery().jobId;
    expect((await POST(request({ action: "recover" }), params)).status).toBe(200);
    expect(delivery()).toMatchObject({ state: "simulated", jobId }); expect(m.queued).toHaveLength(1);
    await run(); expect(m.fetch).not.toHaveBeenCalled(); expect(post.status).toBe("ready");
  });
  it.each(["ready", "social", "pro", "allowed"] as const)("does not mutate or enqueue when %s admission fails", async key => {
    await PATCH(request({ status: "ready" }), params); m[key] = false;
    expect((await schedule()).status).toBeGreaterThanOrEqual(400);
    expect(delivery()).toBeUndefined(); expect(m.queued).toHaveLength(0); expect(m.fetch).not.toHaveBeenCalled();
  });
  it.each([["production", "false"], ["production", "true"], ["development", "false"]])("rejects API %s / mock=%s with no database access", async (environment, mode) => {
    vi.stubEnv("NODE_ENV", environment); vi.stubEnv("SOCIAL_MOCK_MODE", mode); m.from.mockClear();
    expect((await schedule()).status).toBe(503);
    expect(m.from).not.toHaveBeenCalled(); expect(m.queued).toHaveLength(0); expect(m.fetch).not.toHaveBeenCalled();
  });
  it("rejects a forged post payload delivered to a production worker before database access", async () => {
    vi.resetModules(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SOCIAL_MOCK_MODE", "false");
    const on = vi.spyOn(process, "on").mockImplementation(() => process);
    await import("../../../scripts/social-publish-worker"); on.mockRestore(); m.from.mockClear();
    await expect(m.processor!({ name: "publish", data: { postId: id, jobId: "forged", userId: "author", simulated: true } })).rejects.toThrow(/local development simulation/i);
    expect(m.from).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
  });
});
