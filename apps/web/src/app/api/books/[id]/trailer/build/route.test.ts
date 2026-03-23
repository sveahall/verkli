import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOK_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const AUTHOR_ID = "author-1";
const COVER_IMAGE_URL = "https://cdn.example.com/cover.jpg";
const FINAL_URL =
  "https://project.supabase.co/storage/v1/object/public/marketing-media/trailers/author-1/asset-1.mp4";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  requireProBillingForApi: vi.fn(),
  isMarketingEnabled: vi.fn(),
  createAdminClient: vi.fn(),
  createPerUserRateLimiter: vi.fn(() => ({
    check: () => ({ allowed: true }),
  })),
  generateTrailerPrompt: vi.fn(),
  generateImageToVideo: vi.fn(),
  stitchSceneVideos: vi.fn(),
  uploadTrailerAndGetPublicUrl: vi.fn(),
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
  generateTrailerPrompt: (...args: unknown[]) => mocks.generateTrailerPrompt(...args),
}));

vi.mock("@/lib/higgsfield", () => ({
  generateImageToVideo: (...args: unknown[]) => mocks.generateImageToVideo(...args),
}));

vi.mock("@/lib/marketing/trailer-ffmpeg", () => ({
  stitchSceneVideos: (...args: unknown[]) => mocks.stitchSceneVideos(...args),
}));

vi.mock("@/lib/marketing/trailer-storage", () => ({
  uploadTrailerAndGetPublicUrl: (...args: unknown[]) =>
    mocks.uploadTrailerAndGetPublicUrl(...args),
}));

const { POST } = await import("./route");

function makeRequest(overrides: Record<string, unknown> = {}) {
  return new Request(`http://localhost/api/books/${BOOK_ID}/trailer/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "My Book",
      genre: "fantasy",
      description: "An epic adventure.",
      keywords: ["magic", "kingdom", "destiny"],
      tone: "epic",
      ...overrides,
    }),
  });
}

function mockAdminClient() {
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: { id: "asset-1" },
        error: null,
      }),
    })),
  }));

  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  }));

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
      return { insert, update };
    }

    throw new Error(`Unexpected table in test: ${table}`);
  });

  mocks.createAdminClient.mockReturnValue({ from });
  return { insert, update };
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
    mockAdminClient();
  });

  it("builds trailer, uploads final mp4, and marks media asset ready", async () => {
    mocks.generateTrailerPrompt.mockResolvedValue({
      output: {
        scenes: [
          { visual_prompt: "scene one", duration: 5 },
          { visual_prompt: "scene two", duration: 5 },
          { visual_prompt: "scene three", duration: 5 },
        ],
        caption: "caption",
        hashtags: ["#one", "#two"],
        title_card: "My Book",
      },
      metadata: { provider: "template" },
    });
    mocks.generateImageToVideo
      .mockResolvedValueOnce({ requestId: "req-1", videoUrl: "https://cdn.example.com/s1.mp4" })
      .mockResolvedValueOnce({ requestId: "req-2", videoUrl: "https://cdn.example.com/s2.mp4" })
      .mockResolvedValueOnce({ requestId: "req-3", videoUrl: "https://cdn.example.com/s3.mp4" });
    mocks.stitchSceneVideos.mockResolvedValue(Buffer.from("final-video"));
    mocks.uploadTrailerAndGetPublicUrl.mockResolvedValue({ publicUrl: FINAL_URL });

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ id: BOOK_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      assetId: "asset-1",
      url: FINAL_URL,
    });

    expect(mocks.generateImageToVideo).toHaveBeenCalledTimes(3);
    expect(mocks.generateImageToVideo).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        prompt: "scene one",
        imageUrl: COVER_IMAGE_URL,
        durationSeconds: 5,
        includeAudio: true,
      })
    );
  });

  it("forwards audio=false to scene video generation", async () => {
    mocks.generateTrailerPrompt.mockResolvedValue({
      output: {
        scenes: [
          { visual_prompt: "scene one", duration: 5 },
          { visual_prompt: "scene two", duration: 5 },
          { visual_prompt: "scene three", duration: 5 },
        ],
        caption: "caption",
        hashtags: ["#one", "#two"],
        title_card: "My Book",
      },
      metadata: { provider: "template" },
    });
    mocks.generateImageToVideo
      .mockResolvedValueOnce({ requestId: "req-1", videoUrl: "https://cdn.example.com/s1.mp4" })
      .mockResolvedValueOnce({ requestId: "req-2", videoUrl: "https://cdn.example.com/s2.mp4" })
      .mockResolvedValueOnce({ requestId: "req-3", videoUrl: "https://cdn.example.com/s3.mp4" });
    mocks.stitchSceneVideos.mockResolvedValue(Buffer.from("final-video"));
    mocks.uploadTrailerAndGetPublicUrl.mockResolvedValue({ publicUrl: FINAL_URL });

    const response = await POST(makeRequest({ audio: false }), {
      params: Promise.resolve({ id: BOOK_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.generateImageToVideo).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        includeAudio: false,
      })
    );
  });

  it("marks media asset failed when one scene generation fails", async () => {
    const { update } = mockAdminClient();

    mocks.generateTrailerPrompt.mockResolvedValue({
      output: {
        scenes: [
          { visual_prompt: "scene one", duration: 5 },
          { visual_prompt: "scene two", duration: 5 },
          { visual_prompt: "scene three", duration: 5 },
        ],
        caption: "caption",
        hashtags: ["#one", "#two"],
        title_card: "My Book",
      },
      metadata: { provider: "template" },
    });
    mocks.generateImageToVideo.mockRejectedValue(new Error("Scene generation failed"));

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ id: BOOK_ID }),
    });

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toHaveProperty("error", "TEXT_TO_VIDEO_FAILED");
    expect(body).toHaveProperty("detail", "Scene generation failed");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "Scene generation failed",
      })
    );
  });
});
