import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  E_AUDIOBOOK_FEATURE_DISABLED,
  E_AUDIOBOOK_VOICE_UNCONFIGURED,
  E_BOOK_NOT_FOUND,
  E_CHECKOUT_SESSION_FAILED,
  E_INVALID_BOOK_ID,
  E_INVALID_REQUEST_BODY,
  E_AUDIOBOOK_TOO_LONG,
  E_BOOK_VERSION_NOT_FOUND_FOR_LANGUAGE,
  E_NO_CHAPTERS_FOR_VERSION,
} from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  getAudiobookEnabled: vi.fn(),
  createAudiobookCheckoutSession: vi.fn(),
  rateLimitCheck: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/flags", () => ({
  getAudiobookEnabled: mocks.getAudiobookEnabled,
}));

vi.mock("@/lib/payments/stripe", () => ({
  createAudiobookCheckoutSession: mocks.createAudiobookCheckoutSession,
}));

vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({
    check: (...args: unknown[]) => mocks.rateLimitCheck(...args),
  }),
}));

// Force in-memory rate limiter (no Redis)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

const { POST } = await import("./route");

const VALID_UUID = "00000000-0000-4000-8000-000000000001";

function makeRequest(payload: unknown) {
  return new Request(
    `http://localhost/api/books/${VALID_UUID}/audiobook/checkout`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

function mockAuthedUser() {
  mocks.requireAuthorRoleForApi.mockResolvedValue({
    user: { id: "author-1", email: "author@example.com" },
    response: null,
  });
}

function mockUnauthed() {
  mocks.requireAuthorRoleForApi.mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "content-type": "application/json" } }),
  });
}

/** Tiptap content whose extracted narration text is exactly `chars` long. */
function chapterOf(chars: number) {
  return { content: JSON.stringify({ content: [{ text: "a".repeat(chars) }] }) };
}

/**
 * Table-aware Supabase mock. The route reads three tables now — books, then
 * book_versions, then chapters — because the length, missing-version and
 * no-chapters checks all moved in front of the Stripe charge.
 */
function mockBookLookup({
  found,
  ownedByUser = true,
  version = { id: "version-1" } as { id: string } | null,
  chapters = [chapterOf(120)] as { content: string | null }[] | null,
}: {
  found: boolean;
  ownedByUser?: boolean;
  version?: { id: string } | null;
  chapters?: { content: string | null }[] | null;
}) {
  const from = vi.fn((table: string) => {
    if (table === "books") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: found
                ? { id: VALID_UUID, author_id: ownedByUser ? "author-1" : "other-author" }
                : null,
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "book_versions") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: version, error: null }) }),
          }),
        }),
      };
    }
    if (table === "chapters") {
      return {
        select: () => ({
          eq: async () => ({ data: chapters, error: null }),
        }),
      };
    }
    throw new Error(`unexpected table in test: ${table}`);
  });

  mocks.createClient.mockResolvedValue({ from });
}

describe("POST /api/books/[id]/audiobook/checkout", () => {
  const ORIGINAL_ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
  const ORIGINAL_TTS_VOICE_ID = process.env.TTS_VOICE_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAudiobookEnabled.mockReturnValue(true);
    mocks.rateLimitCheck.mockResolvedValue({ allowed: true });
    // A configured narrator voice is the precondition for reaching Stripe at all.
    process.env.ELEVENLABS_VOICE_ID = "elevenlabs-voice-1";
    delete process.env.TTS_VOICE_ID;
  });

  afterEach(() => {
    if (typeof ORIGINAL_ELEVENLABS_VOICE_ID === "undefined") delete process.env.ELEVENLABS_VOICE_ID;
    else process.env.ELEVENLABS_VOICE_ID = ORIGINAL_ELEVENLABS_VOICE_ID;
    if (typeof ORIGINAL_TTS_VOICE_ID === "undefined") delete process.env.TTS_VOICE_ID;
    else process.env.TTS_VOICE_ID = ORIGINAL_TTS_VOICE_ID;
  });

  it("returns 401 when not authenticated", async () => {
    mockUnauthed();

    const res = await POST(makeRequest({ language: "en" }), {
      params: Promise.resolve({ id: VALID_UUID }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when audiobook feature is disabled", async () => {
    mocks.getAudiobookEnabled.mockReturnValue(false);

    const res = await POST(makeRequest({ language: "en" }), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe(E_AUDIOBOOK_FEATURE_DISABLED);
  });

  it("returns 400 for invalid book ID", async () => {
    mockAuthedUser();

    const res = await POST(makeRequest({ language: "en" }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe(E_INVALID_BOOK_ID);
  });

  it("returns 404 when book is not found", async () => {
    mockAuthedUser();
    mockBookLookup({ found: false });

    const res = await POST(makeRequest({ language: "en" }), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe(E_BOOK_NOT_FOUND);
  });

  it("returns 400 when language is missing", async () => {
    mockAuthedUser();

    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe(E_INVALID_REQUEST_BODY);
  });

  it("returns 200 with Stripe checkout url on valid request", async () => {
    mockAuthedUser();
    mockBookLookup({ found: true });
    mocks.createAudiobookCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.com/cs_test_audio",
    });

    const res = await POST(makeRequest({ language: "en" }), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toContain("stripe.com");
  });

  it("returns 500 when Stripe session creation fails", async () => {
    mockAuthedUser();
    mockBookLookup({ found: true });
    mocks.createAudiobookCheckoutSession.mockRejectedValue(
      new Error("Stripe API down")
    );

    const res = await POST(makeRequest({ language: "en" }), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(E_CHECKOUT_SESSION_FAILED);
  });

  // Regression: this guard is the only one that runs BEFORE money moves. The
  // generate route has the same check, but by the time it runs Stripe has already
  // charged 299 SEK and the client has stripped session_id from the URL, so the
  // paid session cannot be redeemed or retried.
  it("refuses checkout before charging when no narrator voice is configured", async () => {
    delete process.env.ELEVENLABS_VOICE_ID;
    delete process.env.TTS_VOICE_ID;
    mockAuthedUser();
    mockBookLookup({ found: true });

    const res = await POST(makeRequest({ language: "en" }), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe(E_AUDIOBOOK_VOICE_UNCONFIGURED);
    // The point of the guard: no Stripe session, so nothing was charged.
    expect(mocks.createAudiobookCheckoutSession).not.toHaveBeenCalled();
  });

  it("accepts TTS_VOICE_ID as the narrator voice, matching the generate route", async () => {
    delete process.env.ELEVENLABS_VOICE_ID;
    process.env.TTS_VOICE_ID = "tts-voice-fallback";
    mockAuthedUser();
    mockBookLookup({ found: true });
    mocks.createAudiobookCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.com/cs_test_audio",
    });

    const res = await POST(makeRequest({ language: "en" }), {
      params: Promise.resolve({ id: VALID_UUID }),
    });

    expect(res.status).toBe(200);
    expect(mocks.createAudiobookCheckoutSession).toHaveBeenCalled();
  });

  // ── Guards that had to move in front of the charge ────────────────────────
  //
  // All three of these were checked only in the generate route or the worker,
  // both of which run after Stripe has taken 299 SEK — and the client strips
  // session_id from the redirect, so the paid session cannot be retried. Every
  // assertion below therefore checks the same thing twice: the right error, and
  // that no Stripe session was created.

  describe("pre-charge guards", () => {
    const ORIGINAL_CAP = process.env.TTS_JOB_CAP_CHARS;

    afterEach(() => {
      if (typeof ORIGINAL_CAP === "undefined") delete process.env.TTS_JOB_CAP_CHARS;
      else process.env.TTS_JOB_CAP_CHARS = ORIGINAL_CAP;
    });

    it("refuses a book over the narration cap without charging", async () => {
      process.env.TTS_JOB_CAP_CHARS = "100";
      mockAuthedUser();
      mockBookLookup({ found: true, chapters: [chapterOf(60), chapterOf(60)] });

      const res = await POST(makeRequest({ language: "en" }), {
        params: Promise.resolve({ id: VALID_UUID }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe(E_AUDIOBOOK_TOO_LONG);
      expect(mocks.createAudiobookCheckoutSession).not.toHaveBeenCalled();
    });

    it("tells the author both numbers, not just that it failed", async () => {
      process.env.TTS_JOB_CAP_CHARS = "100";
      mockAuthedUser();
      mockBookLookup({ found: true, chapters: [chapterOf(250)] });

      const res = await POST(makeRequest({ language: "en" }), {
        params: Promise.resolve({ id: VALID_UUID }),
      });
      const body = await res.json();

      expect(body.characters).toBe(250);
      expect(body.limit).toBe(100);
      expect(body.detail).toContain("250");
      expect(body.detail).toContain("100");
    });

    it("allows a book exactly at the cap", async () => {
      process.env.TTS_JOB_CAP_CHARS = "100";
      mockAuthedUser();
      mockBookLookup({ found: true, chapters: [chapterOf(100)] });
      mocks.createAudiobookCheckoutSession.mockResolvedValue({
        url: "https://checkout.stripe.com/cs_test_audio",
      });

      const res = await POST(makeRequest({ language: "en" }), {
        params: Promise.resolve({ id: VALID_UUID }),
      });

      expect(res.status).toBe(200);
      expect(mocks.createAudiobookCheckoutSession).toHaveBeenCalled();
    });

    it("refuses when no version exists for the requested language", async () => {
      mockAuthedUser();
      mockBookLookup({ found: true, version: null });

      const res = await POST(makeRequest({ language: "de" }), {
        params: Promise.resolve({ id: VALID_UUID }),
      });
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toBe(E_BOOK_VERSION_NOT_FOUND_FOR_LANGUAGE);
      expect(mocks.createAudiobookCheckoutSession).not.toHaveBeenCalled();
    });

    it("refuses when the version has no chapters", async () => {
      mockAuthedUser();
      mockBookLookup({ found: true, chapters: [] });

      const res = await POST(makeRequest({ language: "en" }), {
        params: Promise.resolve({ id: VALID_UUID }),
      });
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toBe(E_NO_CHAPTERS_FOR_VERSION);
      expect(mocks.createAudiobookCheckoutSession).not.toHaveBeenCalled();
    });
  });
});
