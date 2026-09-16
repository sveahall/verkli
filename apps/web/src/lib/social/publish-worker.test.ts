import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ processor: null as null | ((job: unknown) => Promise<void>), from: vi.fn(), fetch: vi.fn() }));
vi.mock("../../../scripts/load-dotenv", () => ({}));
vi.mock("../../../scripts/sentry-worker-init", () => ({ Sentry: { captureException: vi.fn() } }));
vi.mock("@/lib/env", () => ({ assertServerEnv: vi.fn(), getRedisConnectionOptions: () => ({ host: "localhost", port: 6379 }) }));
vi.mock("@/lib/health/worker-heartbeat", () => ({ startHeartbeatInterval: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("./token-crypto", () => ({ decryptToken: () => "test-token", encryptToken: () => "encrypted" }));
vi.mock("./oauth", () => ({ refreshAccessToken: vi.fn() }));
vi.mock("bullmq", () => ({ Worker: class { constructor(_queue: string, processor: typeof mocks.processor) { mocks.processor = processor; } on() { return this; } }, UnrecoverableError: class extends Error {} }));
let output: Record<string, unknown>;
let jobUpdates: Array<Record<string, unknown>>;
let campaignUpdates: Array<Record<string, unknown>>;
let connectionError: boolean;
async function run(platforms = ["x"], mockMode = false) {
  vi.resetModules();
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("SOCIAL_MOCK_MODE", String(mockMode));
  const on = vi.spyOn(process, "on").mockImplementation(() => process);
  await import("../../../scripts/social-publish-worker");
  on.mockRestore();
  return mocks.processor!({ name: "publish", id: "job", data: { jobId: "job", campaignId: "campaign", bookId: "book", userId: "author", platforms } });
}
beforeEach(() => {
  vi.clearAllMocks(); output = {}; jobUpdates = []; campaignUpdates = []; connectionError = false;
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ data: { id: "real-post-id" } }), { status: 200 }));
  mocks.from.mockImplementation((table: string) => {
    let update: Record<string, unknown> | undefined;
    const result = () => {
      if (update) {
        if (table === "ai_jobs") { jobUpdates.push(update); output = { ...output, ...(update.output as object) }; }
        else if (table === "marketing_campaigns") campaignUpdates.push(update);
        return { data: null, error: null };
      }
      if (table === "ai_jobs") return { data: { output }, error: null };
      if (table === "marketing_campaigns") return { data: { id: "campaign", book_id: "book", caption: "Author approved words", channel: "x" }, error: null };
      if (table === "books") return { data: { author_id: "author" }, error: null };
      return { data: ["x", "email", "instagram", "tiktok"].map(platform => ({ platform, status: "active", access_token_enc: "encrypted", email_config_enc: "encrypted" })), error: connectionError ? { message: "database unavailable" } : null };
    };
    const q = { select: () => q, eq: () => q, update: (v: Record<string, unknown>) => { update = v; return q; }, single: async () => result(), then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
    return q;
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("social publishing evidence", () => {
  it("does not mark a campaign published after a simulation", async () => {
    await run(["x"], true);
    expect(output.simulated).toBe(true);
    expect(campaignUpdates).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(["email", "instagram", "tiktok"])("refuses incomplete %s transport without a provider call", async platform => {
    await run([platform]);
    expect(jobUpdates.at(-1)?.status).toBe("failed");
    expect(campaignUpdates).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("requires a provider post id before reporting success", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    await run();
    expect(jobUpdates.at(-1)?.status).toBe("failed");
    expect(campaignUpdates).toEqual([]);
  });
  it("does not repeat a publish with an uncertain previous delivery", async () => {
    output = { dispatched: { x: true } };
    await run();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(jobUpdates.at(-1)?.status).toBe("failed");
  });
  it("cannot turn a previous simulated result into a live publish", async () => {
    output = { simulated: true, results: { x: { status: "ok", postId: "mock-id" } } };
    await expect(run()).rejects.toThrow("simulation");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(campaignUpdates).toEqual([]);
  });
  it("keeps the real provider id in successful results", async () => {
    await run();
    expect(output.results).toMatchObject({ x: { status: "ok", postId: "real-post-id" } });
    expect(campaignUpdates).toEqual([{ status: "published" }]);
  });
});
