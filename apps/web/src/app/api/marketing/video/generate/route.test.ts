import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, maxDuration } from "./route";

// Allowlist the dummy test host so the route's SSRF guard (validateProviderImageUrl)
// accepts VALID_IMAGE_URL. The guard reads this env at call time. Real production
// imageUrls are Supabase-storage hosts, which the guard allows by default.
// Mirrors the trailer/build route test.
process.env.AI_IMAGE_URL_EXTRA_HOSTS = "cdn.example.com";

const VALID_BOOK_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_IMAGE_URL = "https://cdn.example.com/book-cover.jpg";

const mockFrom = vi.fn();
const mockGenerateImageToVideo = vi.fn();

vi.mock("@/lib/auth/require-author-marketing", () => ({
  requireAuthorAndMarketingEnabled: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/higgsfield", () => ({
  generateImageToVideo: (...args: unknown[]) => mockGenerateImageToVideo(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/marketing/trailer-storage", () => ({
  uploadTrailerAndGetPublicUrl: vi.fn(),
}));

// The real limiter is 1/min and in-memory, so without this the second test in
// the file gets a 429 from the first test's request.
const mockRateCheck = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({ check: (...a: unknown[]) => mockRateCheck(...a) }),
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: vi.fn(),
}));

// The route now reserves daily video budget before calling the provider; the
// helper has its own unit tests and must not reach Redis from here.
vi.mock("@/lib/marketing/video-budget", () => ({
  reserveVideoBudget: vi.fn(async () => ({
    ok: true as const,
    reservation: { jobId: "test-job", units: 1 },
  })),
  refundVideoBudget: vi.fn(async () => {}),
}));


const { requireAuthorAndMarketingEnabled } = await import("@/lib/auth/require-author-marketing");
const { requireProBillingForApi } = await import("@/lib/billing/server");
const { uploadTrailerAndGetPublicUrl } = await import("@/lib/marketing/trailer-storage");

const PUBLIC_TRAILER_URL = "https://project.supabase.co/storage/v1/object/public/marketing-media/trailers/author-1/asset-1.mp4";

function gateAuthor(userId: string) {
  vi.mocked(requireAuthorAndMarketingEnabled).mockResolvedValue({
    user: { id: userId } as never,
    response: null,
  });
  mockRateCheck.mockResolvedValue({ allowed: true });
  vi.mocked(requireProBillingForApi).mockResolvedValue({ ok: true } as never);
}

function mockBookOwned() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: VALID_BOOK_ID, title: "My Book" },
            error: null,
          }),
        })),
      })),
    })),
  };
}

function mockBookNotOwned() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        })),
      })),
    })),
  };
}

function mockMediaAssetsTable(assetId = "asset-1") {
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: { id: assetId }, error: null }),
    })),
  }));

  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: assetId }, error: null }),
        })),
      })),
    })),
  }));

  return { insert, update };
}

function mockSupabase({ owned }: { owned: boolean }) {
  const booksTable = owned ? mockBookOwned() : mockBookNotOwned();
  const mediaAssetsTable = mockMediaAssetsTable();
  mockFrom.mockImplementation((table: string) => {
    if (table === "books") return booksTable;
    if (table === "media_assets") return mediaAssetsTable;
    return {};
  });
  return { mediaAssetsTable };
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
  });

  it("enforces maxDuration 180s", () => {
    expect(maxDuration).toBe(180);
  });

  it("returns 400 for invalid JSON", async () => {
    gateAuthor("author-1");
    const req = new Request("http://localhost/api/marketing/video/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for invalid body", async () => {
    gateAuthor("author-1");

    const res = await POST(
      makeRequest({
        bookId: VALID_BOOK_ID,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 404 when book is not owned", async () => {
    gateAuthor("author-1");
    mockSupabase({ owned: false });

    const res = await POST(
      makeRequest({
        bookId: VALID_BOOK_ID,
        prompt: "Create a short teaser video.",
        imageUrl: VALID_IMAGE_URL,
      })
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns assetId and url on successful generation", async () => {
    gateAuthor("author-1");
    const { mediaAssetsTable } = mockSupabase({ owned: true });
    mockGenerateImageToVideo.mockResolvedValue({
      requestId: "req-123",
      videoUrl: "https://cdn.example.com/video.mp4",
    });
    vi.mocked(uploadTrailerAndGetPublicUrl).mockResolvedValue({
      publicUrl: PUBLIC_TRAILER_URL,
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: { get: () => "video/mp4" },
    });

    const res = await POST(
      makeRequest({
        bookId: VALID_BOOK_ID,
        prompt: "Cinematic camera motion.",
        imageUrl: VALID_IMAGE_URL,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      assetId: "asset-1",
      url: PUBLIC_TRAILER_URL,
    });

    expect(mediaAssetsTable.insert).toHaveBeenCalledTimes(1);
    expect(mediaAssetsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "author-1",
        book_id: VALID_BOOK_ID,
        status: "generating",
        provider: "higgsfield",
      })
    );

    expect(mediaAssetsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        provider_request_id: "req-123",
        output_url: PUBLIC_TRAILER_URL,
        metadata: expect.objectContaining({ generation_time_ms: expect.any(Number) }),
        estimated_cost_usd: 0.15,
      })
    );
    expect(mockGenerateImageToVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Cinematic camera motion.",
        imageUrl: VALID_IMAGE_URL,
        includeAudio: true,
      })
    );
  });

  it("forwards the normalized url, not the raw string the caller sent", async () => {
    gateAuthor("author-1");
    mockSupabase({ owned: true });
    mockGenerateImageToVideo.mockResolvedValue({
      requestId: "req-ssrf",
      videoUrl: "https://cdn.example.com/video.mp4",
    });
    vi.mocked(uploadTrailerAndGetPublicUrl).mockResolvedValue({
      publicUrl: PUBLIC_TRAILER_URL,
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: { get: () => "video/mp4" },
    }) as unknown as typeof fetch;

    const confusable = "https://cdn.example.com\\@evil.tld/cover.jpg";
    await POST(
      makeRequest({ bookId: VALID_BOOK_ID, prompt: "a trailer", imageUrl: confusable })
    );

    expect(mockGenerateImageToVideo).toHaveBeenCalledTimes(1);
    const forwarded = mockGenerateImageToVideo.mock.calls[0][0] as { imageUrl: string };
    expect(forwarded.imageUrl).not.toBe(confusable);
    expect(forwarded.imageUrl).not.toContain("\\");
    expect(new URL(forwarded.imageUrl).hostname).toBe("cdn.example.com");
  });

  it("forwards audio=false to Higgsfield", async () => {
    gateAuthor("author-1");
    mockSupabase({ owned: true });
    mockGenerateImageToVideo.mockResolvedValue({
      requestId: "req-456",
      videoUrl: "https://cdn.example.com/video.mp4",
    });
    vi.mocked(uploadTrailerAndGetPublicUrl).mockResolvedValue({
      publicUrl: PUBLIC_TRAILER_URL,
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: { get: () => "video/mp4" },
    });

    const res = await POST(
      makeRequest({
        bookId: VALID_BOOK_ID,
        prompt: "Cinematic camera motion.",
        imageUrl: VALID_IMAGE_URL,
        audio: false,
      })
    );

    expect(res.status).toBe(200);
    expect(mockGenerateImageToVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        includeAudio: false,
      })
    );
  });

  it("marks asset as failed and returns 502 when Higgsfield throws", async () => {
    gateAuthor("author-1");
    const { mediaAssetsTable } = mockSupabase({ owned: true });
    mockGenerateImageToVideo.mockRejectedValue(new Error("Higgsfield timeout"));

    const res = await POST(
      makeRequest({
        bookId: VALID_BOOK_ID,
        prompt: "Cinematic camera motion.",
        imageUrl: VALID_IMAGE_URL,
      })
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toHaveProperty("error", "TEXT_TO_VIDEO_FAILED");

    expect(mediaAssetsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "Higgsfield timeout",
      })
    );
  });
});

describe("POST /api/marketing/video/generate — spend gates", () => {
  // The provider spy accumulates across the file; these assertions are about
  // this request only.
  beforeEach(() => {
    mockGenerateImageToVideo.mockClear();
  });

  const body = {
    bookId: VALID_BOOK_ID,
    prompt: "a lighthouse at dusk",
    imageUrl: VALID_IMAGE_URL,
  };
  const request = () =>
    new Request("http://localhost/api/marketing/video/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("refuses a second generation inside the same minute", async () => {
    gateAuthor("author-1");
    mockRateCheck.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });

    const res = await POST(request());

    expect(res.status).toBe(429);
    // Higgsfield bills per generation — the provider must not be reached.
    expect(mockGenerateImageToVideo).not.toHaveBeenCalled();
  });

  it("refuses an author without Pro before spending anything", async () => {
    gateAuthor("author-1");
    const denial = new Response("pro required", { status: 402 });
    vi.mocked(requireProBillingForApi).mockResolvedValue({
      ok: false,
      response: denial,
    } as never);

    const res = await POST(request());

    expect(res.status).toBe(402);
    expect(mockGenerateImageToVideo).not.toHaveBeenCalled();
  });
});
