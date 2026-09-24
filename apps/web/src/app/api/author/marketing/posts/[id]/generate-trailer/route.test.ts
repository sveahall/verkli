import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), configured: vi.fn(), generate: vi.fn(), reserve: vi.fn(), refund: vi.fn(), claimed: true, pendingError: false, saveError: false, updates: [] as Record<string, unknown>[] }));
vi.mock("@/lib/auth/require-author-marketing", () => ({ requireAuthorAndMarketingEnabled: async () => ({ user: { id: "author" } }) }));
vi.mock("@/lib/billing/server", () => ({ requireProBillingForApi: async () => ({ ok: true }) }));
vi.mock("@/features/ai-team/settings/guard", () => ({ aiDisabledResponse: async () => null }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: async () => ({ allowed: true }) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: m.from }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/higgsfield", () => ({ HIGGSFIELD_MODEL: "dop-turbo", generateImageToVideo: m.generate, assertHiggsfieldConfigured: m.configured }));
vi.mock("@/lib/ai/trailer-generation", () => ({ generateTrailerPrompt: async () => ({ output: { scenes: [{ visual_prompt: "boat", duration: 5 }], caption: "Caption", hashtags: ["#book"] } }) }));
vi.mock("@/lib/marketing/video-budget", () => ({ reserveVideoBudget: m.reserve, refundVideoBudget: m.refund }));
vi.mock("@/lib/marketing/trailer-storage", () => ({ uploadTrailerAndGetPublicUrl: async () => ({ publicUrl: "https://storage.example/trailer.mp4" }) }));
vi.mock("@/lib/security/url-allowlist", () => ({ validateProviderImageUrl: () => ({ ok: true, url: new URL("https://storage.example/cover.jpg") }) }));
import { POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const revision = "2026-09-24T10:00:00Z";
let post: Record<string, unknown>;
const run = () => POST(new Request("http://localhost/trailer", { method: "POST", body: JSON.stringify({ expectedUpdatedAt: revision }) }), { params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.clearAllMocks(); m.configured.mockReset(); m.claimed = true; m.pendingError = false; m.saveError = false; m.updates = [];
  post = { id, author_id: "author", book_id: "book", content_type: "trailer", caption: "Reviewed caption", hashtags: "#reviewed", status: "draft", updated_at: revision, metadata: {} };
  m.reserve.mockResolvedValue({ ok: false, response: new Response(null, { status: 429 }) });
  m.generate.mockResolvedValue({ requestId: "provider-request", videoUrl: "https://storage.example/output.mp4" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("video", { headers: { "content-type": "video/mp4" } })));
  m.from.mockImplementation(table => {
    let patch: Record<string, unknown> | undefined;
    const result = () => ({ data: table === "media_assets" ? { id: "asset" } : table === "books" ? { id: "book", title: "Boat", description: "Boat story", cover_image: "https://storage.example/cover.jpg" } : patch?.status === "asset_pending" && !m.claimed ? null : { ...post, ...patch }, error: (patch?.status === "asset_pending" && m.pendingError) || (patch?.media_asset_url && m.saveError) ? { message: "write failed" } : null });
    const q = { insert: () => q, single: async () => result(), select: () => q, eq: () => q, update: (value: Record<string, unknown>) => { patch = value; if (table === "marketing_posts") m.updates.push(value); return q; }, maybeSingle: async () => result(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
    return q;
  });
});
it("rejects stale media generation before spending", async () => { post.updated_at = "2026-09-24T11:00:00Z"; expect((await run()).status).toBe(409); expect(m.reserve).not.toHaveBeenCalled(); });
it("rejects a second concurrent trailer request", async () => { m.claimed = false; expect((await run()).status).toBe(409); expect(m.generate).not.toHaveBeenCalled(); });
it("fails closed when the generation claim cannot be saved", async () => { m.pendingError = true; expect((await run()).status).toBe(500); expect(m.generate).not.toHaveBeenCalled(); });

afterEach(() => vi.unstubAllGlobals());
it("preserves reviewed copy when attaching a generated trailer", async () => {
  m.reserve.mockResolvedValue({ ok: true, reservation: { jobId: "attempt", units: 1 } });
  const response = await run();
  expect(response.status).toBe(200);
  expect((await response.json()).post).toMatchObject({ caption: "Reviewed caption", hashtags: "#reviewed", mediaAssetUrl: "https://storage.example/trailer.mp4" });
  expect(m.updates.at(-1)).not.toHaveProperty("caption");
});
it("does not claim success or refund a dispatched render when its final save fails", async () => {
  m.reserve.mockResolvedValue({ ok: true, reservation: { jobId: "attempt", units: 1 } });
  m.saveError = true;
  expect((await run()).status).toBe(502);
  expect(m.refund).not.toHaveBeenCalled();
  expect(m.updates.at(-1)?.status).toBe("asset_failed");
});
it("restores an editable failure state when budget admission fails", async () => {
  expect((await run()).status).toBe(429);
  expect(m.updates.at(-1)?.status).toBe("asset_failed");
  expect(m.generate).not.toHaveBeenCalled();
});

it("does not claim or reserve a render when video credentials are missing", async () => {
  m.configured.mockImplementation(() => { throw new Error("HF_CREDENTIALS missing"); });
  expect((await run()).status).toBe(503);
  expect(m.updates).toEqual([]);
  expect(m.reserve).not.toHaveBeenCalled();
  expect(m.generate).not.toHaveBeenCalled();
});
