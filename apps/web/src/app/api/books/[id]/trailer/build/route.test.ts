import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOK_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const AUTHOR_ID = "author-1";
const COVER_IMAGE_URL = "https://cdn.example.com/cover.jpg";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  requireProBillingForApi: vi.fn(),
  isMarketingEnabled: vi.fn(),
  createAdminClient: vi.fn(),
  createPerUserRateLimiter: vi.fn(() => ({
    check: vi.fn().mockResolvedValue({ allowed: true }),
  })),
  enqueueTrailerBuildJob: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: mocks.requireProBillingForApi,
}));

vi.mock("@/lib/flags", () => ({
  isMarketingEnabled: mocks.isMarketingEnabled,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: mocks.createPerUserRateLimiter,
}));

vi.mock("@/lib/marketing-queue", () => ({
  enqueueTrailerBuildJob: mocks.enqueueTrailerBuildJob,
}));

vi.mock("@/lib/ai/trailer-generation", () => ({
  TrailerGenerateRequestSchema: {
    safeParse: (body: unknown) => {
      const value = body as Record<string, unknown>;
      if (
        typeof value?.title === "string" &&
        typeof value?.genre === "string" &&
        typeof value?.description === "string" &&
        Array.isArray(value?.keywords) &&
        typeof value?.tone === "string"
      ) {
        return { success: true, data: value };
      }
      return {
        success: false,
        error: {
          flatten: () => ({ fieldErrors: { title: ["invalid"] } }),
        },
      };
    },
  },
}));

const { POST } = await import("./route");

function makeRequest() {
  return new Request(`http://localhost/api/books/${BOOK_ID}/trailer/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "My Book",
      genre: "fantasy",
      description: "An epic adventure.",
      keywords: ["magic", "kingdom", "destiny"],
      tone: "epic",
    }),
  });
}

function mockAdminClient(options?: { failAiJobCreate?: boolean }) {
  const failAiJobCreate = options?.failAiJobCreate ?? false;

  const mediaInsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: { id: "asset-1" },
        error: null,
      }),
    })),
  }));

  const mediaUpdateEqUser = vi.fn().mockResolvedValue({ error: null });
  const mediaUpdateEqId = vi.fn(() => ({ eq: mediaUpdateEqUser }));
  const mediaUpdate = vi.fn(() => ({ eq: mediaUpdateEqId }));

  const aiInsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue(
        failAiJobCreate
          ? { data: null, error: { message: "insert failed", code: "500" } }
          : { data: { id: "job-1" }, error: null }
      ),
    })),
  }));

  const aiUpdateEqUser = vi.fn().mockResolvedValue({ error: null });
  const aiUpdateEqId = vi.fn(() => ({ eq: aiUpdateEqUser }));
  const aiUpdate = vi.fn(() => ({ eq: aiUpdateEqId }));

  const from = vi.fn((table: string) => {
    if (table === "books") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: BOOK_ID,
                author_id: AUTHOR_ID,
                cover_image: COVER_IMAGE_URL,
              },
              error: null,
            }),
          })),
        })),
      };
    }

    if (table === "media_assets") {
      return { insert: mediaInsert, update: mediaUpdate };
    }

    if (table === "ai_jobs") {
      return { insert: aiInsert, update: aiUpdate };
    }

    throw new Error(`Unexpected table in test: ${table}`);
  });

  mocks.createAdminClient.mockReturnValue({ from });
  return { mediaInsert, mediaUpdate, aiInsert, aiUpdate };
}

describe("POST /api/books/[id]/trailer/build", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: AUTHOR_ID },
      response: null,
    });
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true, response: null });
    mocks.isMarketingEnabled.mockReturnValue(true);
    mocks.enqueueTrailerBuildJob.mockResolvedValue("job-1");
    mockAdminClient();
  });

  it("returns 202 and enqueues trailer build job", async () => {
    const { mediaInsert } = mockAdminClient();

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ id: BOOK_ID }),
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      jobId: "job-1",
      assetId: "asset-1",
      status: "pending",
      statusUrl: "/api/ai/jobs/job-1",
    });

    expect(mediaInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: AUTHOR_ID,
        book_id: BOOK_ID,
        status: "generating",
        provider: "higgsfield",
      })
    );

    expect(mocks.enqueueTrailerBuildJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        assetId: "asset-1",
        bookId: BOOK_ID,
        userId: AUTHOR_ID,
        coverImageUrl: COVER_IMAGE_URL,
      })
    );
  });

  it("marks ai job and media asset failed when queue is unavailable", async () => {
    const { mediaUpdate, aiUpdate } = mockAdminClient();
    mocks.enqueueTrailerBuildJob.mockResolvedValue(null);

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ id: BOOK_ID }),
    });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toHaveProperty("error", "QUEUE_UNAVAILABLE");

    expect(aiUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "Queue unavailable",
      })
    );
    expect(mediaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "Queue unavailable",
      })
    );
  });
});
