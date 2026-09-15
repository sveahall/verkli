import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(), evaluateDemoGuard: vi.fn(), createClient: vi.fn(),
  isAudiobookEnabled: vi.fn(), check: vi.fn(), synthesize: vi.fn(), resolveNarratorVoiceId: vi.fn(),
}));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.requireAuthorRoleForApi }));
vi.mock("@/lib/demo-guard", () => ({ evaluateDemoGuard: mocks.evaluateDemoGuard }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/flags", () => ({ isAudiobookEnabled: mocks.isAudiobookEnabled }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.check }) }));
vi.mock("@/lib/tts/tts-provider", () => ({ resolveNarratorVoiceId: mocks.resolveNarratorVoiceId }));
vi.mock("@/lib/tts/elevenlabs-tts-provider", () => ({ ElevenLabsTtsProvider: class { synthesize = mocks.synthesize; } }));

const { POST } = await import("./route");
const bookId = "00000000-0000-4000-8000-000000000001";
const chapterId = "00000000-0000-4000-8000-000000000002";
const versionId = "00000000-0000-4000-8000-000000000003";
const otherBookId = "00000000-0000-4000-8000-000000000004";
const pronunciation = { word: "Mira", spokenAs: "Mee-ra", sampleText: "Mira väntade." };

function database({ owner = "author-1", chapterBook = bookId, versionBook = bookId, language = "sv", content = "Mira väntade." } = {}) {
  const filters: Record<string, Record<string, unknown>> = {};
  mocks.createClient.mockResolvedValue({ from: (table: string) => {
    const values: Record<string, unknown> = {};
    filters[table] = values;
    const query = {
      select: () => query, order: () => query, limit: () => query,
      eq: (key: string, value: unknown) => { values[key] = value; return query; },
      maybeSingle: async () => ({ error: null, data:
        table === "books" ? (owner === "author-1" ? { id: bookId, author_id: owner, language: "en" } : null) :
        table === "chapters" ? (values.book_id === chapterBook && values.id === chapterId ? { id: chapterId, book_id: chapterBook, book_version_id: versionId, content } : null) :
        values.book_id === versionBook && values.id === versionId ? { id: versionId, book_id: versionBook, language_code: language } : null,
      }),
    };
    return query;
  } });
  return filters;
}

async function post(body: unknown) {
  return POST(new Request(`http://localhost/api/books/${bookId}/audiobook/preview`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: bookId }) });
}

describe("POST audiobook pronunciation preview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.isAudiobookEnabled.mockReturnValue(true);
    mocks.requireAuthorRoleForApi.mockResolvedValue({ user: { id: "author-1" }, response: null });
    mocks.check.mockResolvedValue({ allowed: true });
    mocks.evaluateDemoGuard.mockResolvedValue({ shouldSkip: false });
    mocks.resolveNarratorVoiceId.mockReturnValue("narrator-1");
    mocks.synthesize.mockResolvedValue({ wav: new Uint8Array([1, 2, 3]), format: "mp3" });
    database();
  });
  afterEach(() => vi.restoreAllMocks());

  it("uses the owned chapter's edition language and returns the existing binary format", async () => {
    const filters = database();
    const res = await post({ chapterId, pronunciation });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mocks.synthesize).toHaveBeenCalledWith("Mee-ra väntade.", expect.objectContaining({ language: "sv", voiceId: "narrator-1" }));
    expect(filters.chapters).toEqual({ id: chapterId, book_id: bookId });
    expect(filters.book_versions).toEqual({ id: versionId, book_id: bookId });
  });

  it("refuses a cross-book chapter and its edition without generating fallback audio", async () => {
    database({ chapterBook: otherBookId });
    expect((await post({ chapterId, pronunciation })).status).toBe(404);
    database({ versionBook: otherBookId });
    expect((await post({ chapterId, pronunciation })).status).toBe(404);
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it("refuses a missing chapter target, invalid preview target and overlong alias", async () => {
    database({ content: "Another name." });
    const stale = await post({ chapterId, pronunciation });
    expect(stale.status).toBe(409);
    expect((await stale.json()).detail).toMatch(/no longer|not.*chapter/i);
    database();
    expect((await post({ chapterId, pronunciation: { ...pronunciation, sampleText: "Another name." } })).status).toBe(400);
    expect((await post({ chapterId, pronunciation: { ...pronunciation, spokenAs: "x".repeat(201) } })).status).toBe(400);
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it("rejects incomplete scoped requests and an edition without a language", async () => {
    expect((await post({ pronunciation })).status).toBe(400);
    expect((await post({ chapterId })).status).toBe(400);
    database({ language: "" });
    expect((await post({ chapterId, pronunciation })).status).toBe(400);
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it("preserves legacy text preview and its 200-character limit", async () => {
    const res = await post({ text: `  ${"x".repeat(250)}  ` });
    expect(res.status).toBe(200);
    expect(mocks.synthesize).toHaveBeenCalledWith("x".repeat(200), expect.objectContaining({ voiceId: "narrator-1" }));
  });

  it("preserves feature, auth, rate, ownership and voice gates", async () => {
    mocks.isAudiobookEnabled.mockReturnValueOnce(false);
    expect((await post({ chapterId, pronunciation })).status).toBe(503);
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({ response: new Response(null, { status: 401 }) });
    expect((await post({ chapterId, pronunciation })).status).toBe(401);
    mocks.check.mockResolvedValueOnce({ allowed: false });
    expect((await post({ chapterId, pronunciation })).status).toBe(429);
    database({ owner: "another-author" });
    expect((await post({ chapterId, pronunciation })).status).toBe(404);
    database();
    mocks.resolveNarratorVoiceId.mockReturnValueOnce(null);
    expect((await post({ chapterId, pronunciation })).status).toBe(503);
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });
});
