import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, maxDuration } from "./route";

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

const { requireAuthorAndMarketingEnabled } = await import("@/lib/auth/require-author-marketing");
const { uploadTrailerAndGetPublicUrl } = await import("@/lib/marketing/trailer-storage");

const PUBLIC_TRAILER_URL = "https://project.supabase.co/storage/v1/object/public/marketing-media/trailers/author-1/asset-1.mp4";

function gateAuthor(userId: string) {
  vi.mocked(requireAuthorAndMarketingEnabled).mockResolvedValue({
    user: { id: userId } as never,
    response: null,
  });
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
