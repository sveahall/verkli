import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { E_AUDIOBOOK_FEATURE_DISABLED } from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  requireProBillingForApi: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  enqueueAudiobookJob: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: mocks.requireProBillingForApi,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/audiobook-queue", () => ({
  enqueueAudiobookJob: mocks.enqueueAudiobookJob,
}));

// Force in-memory rate limiter (no Redis)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

const { POST } = await import("./route");

const originalEnv = {
  NEXT_PUBLIC_AUDIOBOOK_ENABLED: process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED,
  AUDIOBOOK_ENABLED: process.env.AUDIOBOOK_ENABLED,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
  TTS_VOICE_ID: process.env.TTS_VOICE_ID,
};

function restoreEnv(key: keyof typeof originalEnv) {
  const value = originalEnv[key];
  if (typeof value === "undefined") delete process.env[key];
  else process.env[key] = value;
}

const BOOK_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Wires up the full mock chain for a request that reaches the ai_jobs insert:
 * book → version → (no active job) → chapter count → admin insert → enqueue.
 * Returns the `insert` spy so tests can assert on the persisted payload.
 *
 * `userId` is per-test on purpose: the route's rate limiter is a module-level
 * per-user bucket (5/min) that outlives `vi.clearAllMocks()`, so tests sharing
 * an author id start 429-ing once enough of them run.
 */
function setupHappyPathMocks(userId = "author-1") {
  mocks.requireAuthorRoleForApi.mockResolvedValue({
    user: { id: userId },
    response: null,
  });
  mocks.requireProBillingForApi.mockResolvedValue({ ok: true, response: null });
  mocks.enqueueAudiobookJob.mockResolvedValue("queued-1");

  const booksQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  booksQuery.select.mockReturnValue(booksQuery);
  booksQuery.eq.mockReturnValue(booksQuery);
  booksQuery.maybeSingle.mockResolvedValue({
    data: { id: BOOK_ID, author_id: userId, language: "sv", original_language: "sv" },
    error: null,
  });

  const versionsQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  versionsQuery.select.mockReturnValue(versionsQuery);
  versionsQuery.eq.mockReturnValue(versionsQuery);
  versionsQuery.maybeSingle.mockResolvedValue({
    data: { id: "version-1", language_code: "sv" },
    error: null,
  });

  const aiJobsByBookQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    is: vi.fn(),
  };
  aiJobsByBookQuery.select.mockReturnValue(aiJobsByBookQuery);
  aiJobsByBookQuery.eq.mockReturnValue(aiJobsByBookQuery);
  aiJobsByBookQuery.in.mockReturnValue(aiJobsByBookQuery);
  aiJobsByBookQuery.order.mockReturnValue(aiJobsByBookQuery);
  aiJobsByBookQuery.limit.mockReturnValue(aiJobsByBookQuery);
  aiJobsByBookQuery.is.mockReturnValue(aiJobsByBookQuery);
  aiJobsByBookQuery.maybeSingle.mockResolvedValue({ data: null, error: null });

  const aiJobsLegacyQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    is: vi.fn(),
  };
  aiJobsLegacyQuery.select.mockReturnValue(aiJobsLegacyQuery);
  aiJobsLegacyQuery.eq.mockReturnValue(aiJobsLegacyQuery);
  aiJobsLegacyQuery.in.mockReturnValue(aiJobsLegacyQuery);
  aiJobsLegacyQuery.order.mockReturnValue(aiJobsLegacyQuery);
  aiJobsLegacyQuery.is.mockReturnValue(aiJobsLegacyQuery);
  aiJobsLegacyQuery.limit.mockResolvedValue({ data: [], error: null });

  const chaptersCountQuery = {
    select: vi.fn(),
    eq: vi.fn(),
  };
  chaptersCountQuery.select.mockReturnValue(chaptersCountQuery);
  chaptersCountQuery.eq.mockResolvedValue({ count: 2, error: null });

  let aiJobsLookupCalls = 0;
  mocks.createClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "books") return booksQuery;
      if (table === "book_versions") return versionsQuery;
      if (table === "chapters") return chaptersCountQuery;
      if (table === "ai_jobs") {
        aiJobsLookupCalls += 1;
        return aiJobsLookupCalls === 1 ? aiJobsByBookQuery : aiJobsLegacyQuery;
      }
      throw new Error(`Unexpected table in test: ${table}`);
    }),
  });

  const single = vi.fn().mockResolvedValue({ data: { id: "job-new-1" }, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "ai_jobs") {
        return { insert, update: vi.fn(), eq: vi.fn() };
      }
      throw new Error(`Unexpected admin table in test: ${table}`);
    }),
  });

  return { insert };
}

function generateRequest() {
  return new Request("http://localhost/api/books/book-1/audiobook/generate", {
    method: "POST",
  });
}

describe("POST /api/books/[id]/audiobook/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "false";
    process.env.AUDIOBOOK_ENABLED = "false";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    // A narrator voice is deployment config with no safe default; every test
    // that expects to reach the job insert needs one configured.
    process.env.ELEVENLABS_VOICE_ID = "elevenlabs-voice-1";
    delete process.env.TTS_VOICE_ID;
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true, response: null });
  });

  afterEach(() => {
    restoreEnv("NEXT_PUBLIC_AUDIOBOOK_ENABLED");
    restoreEnv("AUDIOBOOK_ENABLED");
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL");
    restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    restoreEnv("ELEVENLABS_VOICE_ID");
    restoreEnv("TTS_VOICE_ID");
  });

  it("returns 503 and never attempts enqueue when audiobook feature flag is off", async () => {
    const req = new Request("http://localhost/api/books/book-1/audiobook/generate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      error: E_AUDIOBOOK_FEATURE_DISABLED,
    });
    expect(mocks.requireAuthorRoleForApi).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.enqueueAudiobookJob).not.toHaveBeenCalled();
  });

  it("requires authentication/author role before any DB work", async () => {
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "true";
    process.env.AUDIOBOOK_ENABLED = "true";

    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    });

    const req = new Request("http://localhost/api/books/book-1/audiobook/generate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) });

    expect(res.status).toBe(401);
    expect(mocks.requireProBillingForApi).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.enqueueAudiobookJob).not.toHaveBeenCalled();
  });

  it("returns 202 with jobId when a job is already active", async () => {
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "true";
    process.env.AUDIOBOOK_ENABLED = "true";

    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "author-1" },
      response: null,
    });
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true, response: null });

    const booksQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    booksQuery.select.mockReturnValue(booksQuery);
    booksQuery.eq.mockReturnValue(booksQuery);
    booksQuery.maybeSingle.mockResolvedValue({
      data: { id: "00000000-0000-4000-8000-000000000001", author_id: "author-1", language: "sv", original_language: "sv" },
      error: null,
    });

    const versionsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    versionsQuery.select.mockReturnValue(versionsQuery);
    versionsQuery.eq.mockReturnValue(versionsQuery);
    versionsQuery.maybeSingle.mockResolvedValue({
      data: { id: "version-1", language_code: "sv" },
      error: null,
    });

    const aiJobsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(),
      is: vi.fn(),
    };
    aiJobsQuery.select.mockReturnValue(aiJobsQuery);
    aiJobsQuery.eq.mockReturnValue(aiJobsQuery);
    aiJobsQuery.in.mockReturnValue(aiJobsQuery);
    aiJobsQuery.order.mockReturnValue(aiJobsQuery);
    aiJobsQuery.limit.mockReturnValue(aiJobsQuery);
    aiJobsQuery.is.mockReturnValue(aiJobsQuery);
    aiJobsQuery.maybeSingle.mockResolvedValue({
      data: {
        id: "job-active-1",
        status: "processing",
        output: { totalChapters: 10, completedChapters: 2 },
        input: { bookId: "00000000-0000-4000-8000-000000000001" },
      },
      error: null,
    });

    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "books") return booksQuery;
        if (table === "book_versions") return versionsQuery;
        if (table === "ai_jobs") return aiJobsQuery;
        throw new Error(`Unexpected table in test: ${table}`);
      }),
    });

    const req = new Request("http://localhost/api/books/book-1/audiobook/generate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) });
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.jobId).toBe("job-active-1");
    expect(body.status).toBe("running");
    // createAdminClient is called eagerly in the route (before the active-job check)
    expect(mocks.enqueueAudiobookJob).not.toHaveBeenCalled();
  });

  it("persists path-only job output (never public audio URLs)", async () => {
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "true";
    process.env.AUDIOBOOK_ENABLED = "true";

    const { insert } = setupHappyPathMocks();

    const res = await POST(generateRequest(), { params: Promise.resolve({ id: BOOK_ID }) });
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.jobId).toBe("job-new-1");
    expect(insert).toHaveBeenCalledTimes(1);

    const payload = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    const output = payload.output as Record<string, unknown>;
    expect(output.audioPath).toBeNull();
    expect(output.audioBucket).toBeNull();
    expect(output.manifestPath).toBeNull();
    expect(output.manifestBucket).toBeNull();
    expect("audioUrl" in output).toBe(false);
    expect(JSON.stringify(payload)).not.toMatch(/https?:\/\//i);
  });

  // ── Narrator voice configuration ─────────────────────────────────────────
  // Regression guard for the "Ryan" trap: "Ryan" is a Qwen speaker name from a
  // deleted TTS stack that ElevenLabs rejects with a 4xx. It used to be the
  // final fallback, so an unconfigured deployment silently queued jobs that
  // could never succeed.

  it("refuses to enqueue when no narrator voice is configured", async () => {
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "true";
    process.env.AUDIOBOOK_ENABLED = "true";
    delete process.env.ELEVENLABS_VOICE_ID;
    delete process.env.TTS_VOICE_ID;

    setupHappyPathMocks("author-voice-missing");

    const res = await POST(generateRequest(), { params: Promise.resolve({ id: BOOK_ID }) });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe(E_AUDIOBOOK_FEATURE_DISABLED);
    // Nothing may be charged, written or queued for a deployment that cannot
    // possibly narrate: the refusal lands before the Stripe redemption claim.
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.enqueueAudiobookJob).not.toHaveBeenCalled();
  });

  it("treats a blank voice env var as unconfigured rather than sending it", async () => {
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "true";
    process.env.AUDIOBOOK_ENABLED = "true";
    process.env.ELEVENLABS_VOICE_ID = "   ";
    delete process.env.TTS_VOICE_ID;

    setupHappyPathMocks("author-voice-blank");

    const res = await POST(generateRequest(), { params: Promise.resolve({ id: BOOK_ID }) });

    expect(res.status).toBe(503);
    expect(mocks.enqueueAudiobookJob).not.toHaveBeenCalled();
  });

  it("falls through to TTS_VOICE_ID when ELEVENLABS_VOICE_ID is blank", async () => {
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "true";
    process.env.AUDIOBOOK_ENABLED = "true";
    process.env.ELEVENLABS_VOICE_ID = "";
    process.env.TTS_VOICE_ID = "tts-voice-2";

    const { insert } = setupHappyPathMocks("author-voice-tts");

    const res = await POST(generateRequest(), { params: Promise.resolve({ id: BOOK_ID }) });

    expect(res.status).toBe(202);
    const payload = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((payload.input as Record<string, unknown>).voiceId).toBe("tts-voice-2");
    expect(mocks.enqueueAudiobookJob).toHaveBeenCalledWith(
      expect.objectContaining({ voiceId: "tts-voice-2" })
    );
  });

  it("sends the configured voice id — never a hardcoded speaker name", async () => {
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "true";
    process.env.AUDIOBOOK_ENABLED = "true";
    process.env.ELEVENLABS_VOICE_ID = "elevenlabs-voice-1";

    const { insert } = setupHappyPathMocks("author-voice-eleven");

    const res = await POST(generateRequest(), { params: Promise.resolve({ id: BOOK_ID }) });

    expect(res.status).toBe(202);
    const payload = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((payload.input as Record<string, unknown>).voiceId).toBe("elevenlabs-voice-1");
    expect(JSON.stringify(payload)).not.toContain("Ryan");
    expect(mocks.enqueueAudiobookJob).toHaveBeenCalledWith(
      expect.objectContaining({ voiceId: "elevenlabs-voice-1" })
    );
  });
});
