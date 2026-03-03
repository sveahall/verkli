import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID_BOOK_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_IMAGE_URL = "https://cdn.example.com/book-cover.jpg";

const mocks = vi.hoisted(() => ({
  requireAuthorAndMarketingEnabled: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  assertBookOwned: vi.fn(),
  enqueueMarketingVideoGenerateJob: vi.fn(),
}));

vi.mock("@/lib/auth/require-author-marketing", () => ({
  requireAuthorAndMarketingEnabled: mocks.requireAuthorAndMarketingEnabled,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/marketing/assert-book-owner", () => ({
  assertBookOwned: mocks.assertBookOwned,
}));

vi.mock("@/lib/marketing-queue", () => ({
  enqueueMarketingVideoGenerateJob: mocks.enqueueMarketingVideoGenerateJob,
}));

const { POST, maxDuration } = await import("./route");

function gateAuthor(userId: string) {
  mocks.requireAuthorAndMarketingEnabled.mockResolvedValue({
    user: { id: userId },
    response: null,
  });
}

function mockSupabase(assetId = "asset-1") {
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: { id: assetId }, error: null }),
    })),
  }));

  const updateEqUser = vi.fn().mockResolvedValue({ error: null });
  const updateEqId = vi.fn(() => ({ eq: updateEqUser }));
  const update = vi.fn(() => ({ eq: updateEqId }));

  const from = vi.fn((table: string) => {
    if (table === "media_assets") {
      return { insert, update };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  mocks.createClient.mockResolvedValue({ from });
  return { insert, update, updateEqId, updateEqUser, from };
}

function mockAdmin(jobId = "job-1", options?: { failCreate?: boolean }) {
  const failCreate = options?.failCreate ?? false;
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue(
        failCreate
          ? { data: null, error: { message: "insert failed", code: "500" } }
          : { data: { id: jobId }, error: null }
      ),
    })),
  }));

  const updateEqUser = vi.fn().mockResolvedValue({ error: null });
  const updateEqId = vi.fn(() => ({ eq: updateEqUser }));
  const update = vi.fn(() => ({ eq: updateEqId }));

  const from = vi.fn((table: string) => {
    if (table === "ai_jobs") {
      return { insert, update };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  mocks.createAdminClient.mockReturnValue({ from });
  return { insert, update, updateEqId, updateEqUser, from };
}

function makeRequest(payload: unknown) {
  return new Request("http://localhost/api/marketing/video/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/marketing/video/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gateAuthor("author-1");
    mockSupabase();
    mockAdmin();
    mocks.assertBookOwned.mockResolvedValue({
      ok: true,
      book: { id: VALID_BOOK_ID, title: "My Book" },
    });
    mocks.enqueueMarketingVideoGenerateJob.mockResolvedValue("job-1");
  });

  it("enforces maxDuration 180s", () => {
    expect(maxDuration).toBe(180);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/marketing/video/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(
      makeRequest({
        bookId: VALID_BOOK_ID,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error", "VALIDATION_FAILED");
  });

  it("returns 404 when book is not owned", async () => {
    mocks.assertBookOwned.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "BOOK_NOT_FOUND" }), { status: 404 }),
    });

    const res = await POST(
      makeRequest({
        bookId: VALID_BOOK_ID,
        prompt: "Create a short teaser video.",
        imageUrl: VALID_IMAGE_URL,
      })
    );

    expect(res.status).toBe(404);
  });

  it("returns 202 and queues a marketing video generation job", async () => {
    const { insert: insertMediaAsset } = mockSupabase("asset-1");
    mockAdmin("job-1");

    const res = await POST(
      makeRequest({
        bookId: VALID_BOOK_ID,
        prompt: "Cinematic camera motion.",
        imageUrl: VALID_IMAGE_URL,
      })
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      jobId: "job-1",
      assetId: "asset-1",
      status: "pending",
      statusUrl: "/api/ai/jobs/job-1",
    });

    expect(insertMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "author-1",
        book_id: VALID_BOOK_ID,
        status: "generating",
        provider: "higgsfield",
      })
    );

    expect(mocks.enqueueMarketingVideoGenerateJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        assetId: "asset-1",
        bookId: VALID_BOOK_ID,
        userId: "author-1",
      })
    );
  });

  it("marks ai job and asset as failed when queue is unavailable", async () => {
    const { update: updateMediaAsset } = mockSupabase("asset-1");
    const { update: updateAiJob } = mockAdmin("job-1");
    mocks.enqueueMarketingVideoGenerateJob.mockResolvedValue(null);

    const res = await POST(
      makeRequest({
        bookId: VALID_BOOK_ID,
        prompt: "Cinematic camera motion.",
        imageUrl: VALID_IMAGE_URL,
      })
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toHaveProperty("error", "QUEUE_UNAVAILABLE");

    expect(updateAiJob).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "Queue unavailable",
      })
    );
    expect(updateMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "Queue unavailable",
      })
    );
  });
});
