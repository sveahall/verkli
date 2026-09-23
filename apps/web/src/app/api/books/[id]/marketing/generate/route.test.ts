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

// Mutable error slots so both DB failure branches stay expressible; reset in beforeEach.
const dbErrors: { book: { message: string } | null; upsert: { message: string } | null } = { book: null, upsert: null };
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
    // Both error slots default to null but are settable per test. Hardcoding
    // `error: null` here made route.ts:57 (bookFetchError) and route.ts:96
    // (upsertError) unreachable in every test — the suite proved the campaign
    // is NOT overwritten when the AI fails, but nothing proved a FAILED persist
    // is reported rather than returning 200 with copy that was never saved.
    dbErrors.book = null;
    dbErrors.upsert = null;
    m.save.mockImplementation((value) => ({ select: () => ({ single: async () => ({ data: dbErrors.upsert ? null : value, error: dbErrors.upsert }) }) }));
    m.from.mockImplementation((table) => table === "books"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: dbErrors.book ? null : book, error: dbErrors.book }) }) }) }
      : { upsert: m.save });
  });

  it("reports a book fetch failure without calling the AI", async () => {
    dbErrors.book = { message: "connection reset" };
    const response = await post();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "DATABASE_ERROR" });
    expect(m.copy).not.toHaveBeenCalled();
  });

  it("reports a failed persist instead of returning copy that was never saved", async () => {
    dbErrors.upsert = { message: "upsert failed" };
    const response = await post();
    expect(m.copy).toHaveBeenCalled();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "DATABASE_ERROR" });
  });

  it("stores actual AI text with the selected language and channel", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(m.copy).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: "author-1", title: "Ocean", description: "A sea journey",
        language: "sv", channel: "instagram",
        meter: expect.objectContaining({ pipeline: "marketing" }) })
    );
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
