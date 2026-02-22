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

const { POST } = await import("./route");

const originalEnv = {
  NEXT_PUBLIC_AUDIOBOOK_ENABLED: process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED,
  AUDIOBOOK_ENABLED: process.env.AUDIOBOOK_ENABLED,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

describe("POST /api/books/[id]/audiobook/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "false";
    process.env.AUDIOBOOK_ENABLED = "false";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true, response: null });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = originalEnv.NEXT_PUBLIC_AUDIOBOOK_ENABLED;
    process.env.AUDIOBOOK_ENABLED = originalEnv.AUDIOBOOK_ENABLED;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("returns 503 and never attempts enqueue when audiobook feature flag is off", async () => {
    const req = new Request("http://localhost/api/books/book-1/audiobook/generate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "book-1" }) });
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

    const res = await POST(req, { params: Promise.resolve({ id: "book-1" }) });

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
      data: { id: "book-1", author_id: "author-1", language: "sv", original_language: "sv" },
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
        input: { bookId: "book-1" },
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

    const res = await POST(req, { params: Promise.resolve({ id: "book-1" }) });
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

    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "author-1" },
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
      data: { id: "book-1", author_id: "author-1", language: "sv", original_language: "sv" },
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
    aiJobsByBookQuery.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

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
    aiJobsLegacyQuery.limit.mockResolvedValue({
      data: [],
      error: null,
    });

    const chaptersCountQuery = {
      select: vi.fn(),
      eq: vi.fn(),
    };
    chaptersCountQuery.select.mockReturnValue(chaptersCountQuery);
    chaptersCountQuery.eq.mockResolvedValue({
      count: 2,
      error: null,
    });

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
          return {
            insert,
            update: vi.fn(),
            eq: vi.fn(),
          };
        }
        throw new Error(`Unexpected admin table in test: ${table}`);
      }),
    });

    const req = new Request("http://localhost/api/books/book-1/audiobook/generate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "book-1" }) });
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
});
