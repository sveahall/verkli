import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const m = vi.hoisted(() => ({ auth: vi.fn(), pro: vi.fn(), from: vi.fn(), copy: vi.fn(), save: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/env", () => ({ assertPublicEnv: () => {} }));
vi.mock("@/lib/flags", () => ({ isMarketingEnabled: () => true }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: m.auth }));
vi.mock("@/lib/billing/server", () => ({ requireProBillingForApi: m.pro }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: m.from }) }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: m.limit }) }));
vi.mock("@/lib/marketing/generate-launch-copy", async (original) => ({ ...await original<object>(), generateLaunchCopy: m.copy }));

const id = "11111111-1111-4111-8111-111111111111";
const book = { id, title: "Ocean", description: "A sea journey", author_id: "author-1" };
const draft = { headline: "Ocean", body: "Läs om havet", cta: "Upptäck boken", hashtags: "#Ocean" };
const request = () => new Request("http://localhost/api/books/1/marketing/generate", { method: "POST", body: JSON.stringify({ channel: "instagram", language: "sv" }) });
const post = () => POST(request(), { params: Promise.resolve({ id }) });

describe("marketing generation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ user: { id: "author-1" } });
    m.pro.mockResolvedValue({ ok: true });
    m.limit.mockResolvedValue({ allowed: true });
    m.copy.mockResolvedValue(draft);
    m.save.mockImplementation((value) => ({ select: () => ({ single: async () => ({ data: value, error: null }) }) }));
    m.from.mockImplementation((table) => table === "books"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: book, error: null }) }) }) }
      : { upsert: m.save });
  });

  it("stores actual AI text with the selected language and channel", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(m.copy).toHaveBeenCalledWith({ authorId: "author-1", title: "Ocean", description: "A sea journey", language: "sv", channel: "instagram" });
    expect(await response.json()).toMatchObject({ language: "sv", channel: "instagram", caption: draft.body, headline: draft.headline });
  });

  it("does not overwrite the old campaign if AI fails", async () => {
    m.copy.mockRejectedValue(new Error("failed"));
    expect((await post()).status).toBe(502);
    expect(m.save).not.toHaveBeenCalled();
  });

  it("does not generate for another author's book", async () => {
    m.auth.mockResolvedValue({ user: { id: "someone-else" } });
    expect((await post()).status).toBe(404);
    expect(m.copy).not.toHaveBeenCalled();
  });

  it("respects the existing subscription gate", async () => {
    m.pro.mockResolvedValue({ ok: false, response: Response.json({ error: "PRO_REQUIRED" }, { status: 403 }) });
    expect((await post()).status).toBe(403);
    expect(m.copy).not.toHaveBeenCalled();
  });

  it("limits repeated billable generations", async () => {
    m.limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 20 });
    expect((await post()).status).toBe(429);
    expect(m.copy).not.toHaveBeenCalled();
  });
});
