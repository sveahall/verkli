import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  E_AUDIOBOOK_FEATURE_DISABLED,
  E_AUDIOBOOK_VOICE_UNCONFIGURED,
  E_BOOK_NOT_FOUND,
  E_CHECKOUT_SESSION_FAILED,
  E_INVALID_BOOK_ID,
  E_INVALID_REQUEST_BODY,
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

function mockBookLookup({ found, ownedByUser = true }: { found: boolean; ownedByUser?: boolean }) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: found
      ? { id: VALID_UUID, author_id: ownedByUser ? "author-1" : "other-author" }
      : null,
    error: null,
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

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
});
