import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), synthesize: vi.fn(), upload: vi.fn(), sign: vi.fn(), budget: vi.fn(), owned: true, claimed: true, saveFails: false }));
vi.mock("@/lib/auth/require-author-marketing", () => ({ requireAuthorAndMarketingEnabled: async () => ({ user: { id: "author" } }) }));
vi.mock("@/lib/billing/server", () => ({ requireProBillingForApi: async () => ({ ok: true }) }));
vi.mock("@/features/ai-team/settings/guard", () => ({ aiDisabledResponse: async () => null }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: async () => ({ allowed: true }) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: m.from }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: () => ({ upload: m.upload, createSignedUrl: m.sign }) } }) }));
vi.mock("@/lib/tts/elevenlabs-tts-provider", () => ({ ElevenLabsTtsProvider: class { synthesize = m.synthesize; } }));
vi.mock("@/lib/tts/tts-provider", () => ({ resolveNarratorVoiceId: () => "voice", assertElevenLabsEnv: () => {} }));
vi.mock("@/lib/workers/budget", () => ({ checkBudget: m.budget, validateJobCost: vi.fn(), releaseBudget: vi.fn() }));
import { POST, GET } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const revision = "2026-09-24T10:00:00Z";
let row: Record<string, unknown>;
const request = () => new Request("http://localhost/audio", { method: "POST", body: JSON.stringify({ expectedUpdatedAt: revision }) });
const context = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.clearAllMocks(); m.owned = true; m.claimed = true; m.saveFails = false;
  row = { id, book_id: "book", author_id: "author", content_type: "podcast", status: "draft", caption: "A story about a small boat.", language: "en", metadata: {}, updated_at: revision };
  m.synthesize.mockResolvedValue({ wav: Buffer.from("audio"), format: "mp3" });
  m.upload.mockResolvedValue({ error: null }); m.budget.mockResolvedValue(undefined);
  m.from.mockImplementation(() => {
    let patch: Record<string, unknown> | null = null;
    const q = { select: () => q, eq: () => q, update: (value: Record<string, unknown>) => { patch = value; return q; }, maybeSingle: async () => {
      if (!m.owned) return { data: null, error: null };
      if (patch?.status === "asset_pending" && !m.claimed) return { data: null, error: null };
      if (patch?.media_asset_url && m.saveFails) return { data: null, error: { message: "save failed" } };
      if (patch) row = { ...row, ...patch };
      return { data: row, error: null };
    }, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
    return q;
  });
});
describe("private campaign audio", () => {
  it("rejects another author's post without spending", async () => {
    m.owned = false;
    expect((await POST(request(), context)).status).toBe(404);
    expect(m.synthesize).not.toHaveBeenCalled();
  });
  it("does not generate from an outdated revision", async () => {
    row.updated_at = "2026-09-24T11:00:00Z";
    expect((await POST(request(), context)).status).toBe(409);
    expect(m.synthesize).not.toHaveBeenCalled();
  });
  it("only one concurrent generation can claim a post", async () => {
    m.claimed = false;
    expect((await POST(request(), context)).status).toBe(409);
    expect(m.synthesize).not.toHaveBeenCalled();
  });
  it("stores narrated copy privately and returns a saved post", async () => {
    expect((await POST(request(), context)).status).toBe(200);
    expect(m.synthesize).toHaveBeenCalledWith(row.caption, expect.objectContaining({ meter: expect.objectContaining({ userId: "author", bookId: "book" }) }));
    expect(m.upload).toHaveBeenCalledWith(expect.stringContaining(`marketing/author/${id}/`), expect.any(Buffer), expect.objectContaining({ contentType: "audio/mpeg" }));
    expect(row.media_asset_url).toBe(`/api/author/marketing/posts/${id}/generate-audio`);
    expect(row.status).toBe("draft");
  });
  it("does not report success when storing the media fails", async () => {
    m.upload.mockResolvedValue({ error: { message: "storage unavailable" } });
    expect((await POST(request(), context)).status).toBe(502);
  });
  it("does not report success when saving the final post fails", async () => {
    m.saveFails = true;
    expect((await POST(request(), context)).status).toBe(502);
  });
  it("does not sign a forged path outside this author's post", async () => {
    row.metadata = { audioStoragePath: "marketing/another-author/other-post/audio.mp3" };
    expect((await GET(new Request("http://localhost/audio"), context)).status).toBe(404);
    expect(m.sign).not.toHaveBeenCalled();
  });
});
