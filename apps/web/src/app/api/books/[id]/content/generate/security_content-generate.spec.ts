import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock @/lib/api-errors — real apiError + constants (avoids @/ alias resolution)
vi.mock("@/lib/api-errors", () => ({
  apiError: (key: string, status: number, extra?: Record<string, unknown>) =>
    NextResponse.json({ error: key, ...extra }, { status }),
  E_UNAUTHORIZED: "UNAUTHORIZED",
  E_MARKETING_FEATURE_DISABLED: "MARKETING_FEATURE_DISABLED",
  E_RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  E_BOOK_NOT_FOUND: "BOOK_NOT_FOUND",
  E_VALIDATION_FAILED: "VALIDATION_FAILED",
  E_CONTENT_INVALID_CHANNEL_TYPE: "CONTENT_INVALID_CHANNEL_TYPE",
  E_CONTENT_GENERATION_FAILED: "CONTENT_GENERATION_FAILED",
}));

// Mock @/lib/rate-limit — real token bucket implementation
vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: (opts: { maxPerMinute: number; windowMs?: number }) => {
    const windowMs = opts.windowMs ?? 60_000;
    const max = opts.maxPerMinute;
    const map = new Map<string, { tokens: number; lastRefill: number }>();
    return {
      check(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
        const now = Date.now();
        const existing = map.get(userId);
        if (!existing) {
          map.set(userId, { tokens: max - 1, lastRefill: now });
          return { allowed: true };
        }
        const elapsed = now - existing.lastRefill;
        if (elapsed >= windowMs) {
          existing.tokens = max - 1;
          existing.lastRefill = now;
          return { allowed: true };
        }
        if (existing.tokens <= 0) {
          return { allowed: false, retryAfterSeconds: Math.ceil((windowMs - elapsed) / 1000) };
        }
        existing.tokens -= 1;
        return { allowed: true };
      },
      _reset() { map.clear(); },
    };
  },
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: vi.fn(),
}));

vi.mock("@/lib/flags", () => ({
  isMarketingEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/supabase/admin", () => {
  let mockAuthorId = "u1";
  return {
    createAdminClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() =>
          Promise.resolve({
            data: { id: "book-1", author_id: mockAuthorId },
            error: null,
          })
        ),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      })),
    })),
    __setMockAuthorId: (id: string) => {
      mockAuthorId = id;
    },
  };
});

vi.mock("@/lib/ai/content-generation", async () => {
  const { z } = await import("zod");

  const ContentTypeSchema = z.enum(["video", "image", "text"]);
  const ChannelSchema = z.enum(["ig", "tiktok", "x", "email", "generic"]);
  const ToneSchema = z.enum(["casual", "professional", "urgent"]);

  const ContentGenerationRequestSchema = z.object({
    contentType: ContentTypeSchema,
    channel: ChannelSchema,
    language: z.string().min(2).max(10).default("sv"),
    tone: ToneSchema.optional(),
    headline: z.string().max(200).optional(),
    body: z.string().max(2000).optional(),
    cta: z.string().max(100).optional(),
    durationSeconds: z.number().int().min(4).max(60).optional(),
    aspectRatio: z.string().max(20).optional(),
    userPromptAddendum: z.string().max(500).optional(),
  });

  const CHANNEL_CONSTRAINTS = {
    ig: { maxHeadline: 100, maxBody: 2200, maxHashtags: 30, allowedContentTypes: ["video", "image", "text"] },
    tiktok: { maxHeadline: 80, maxBody: 300, maxHashtags: 5, allowedContentTypes: ["video", "text"] },
    x: { maxHeadline: 50, maxBody: 280, maxHashtags: 3, allowedContentTypes: ["image", "text"] },
    email: { maxHeadline: 120, maxBody: 2000, maxHashtags: 0, allowedContentTypes: ["image", "text"] },
    generic: { maxHeadline: 200, maxBody: 2000, maxHashtags: 10, allowedContentTypes: ["video", "image", "text"] },
  };

  return {
    ContentGenerationRequestSchema,
    CHANNEL_CONSTRAINTS,
    buildBookSnapshot: vi.fn(() =>
      Promise.resolve({
        title: "Test Book",
        description: "A test",
        language: "sv",
        coverImageUrl: null,
        chapterExcerpt: null,
        chapterCount: 5,
      })
    ),
    generateContent: vi.fn(() =>
      Promise.resolve({
        assetId: "asset-1",
        version: 1,
        contentType: "text",
        channel: "ig",
        assetUrl: null,
        textContent: { headline: "Test Book", body: "Body", cta: "Läs" },
        metadata: { provider: "stub-copywriter", stub: true },
      })
    ),
  };
});

const { requireAuthorRoleForApi } = await import("@/lib/auth/require-author");
const { requireProBillingForApi } = await import("@/lib/billing/server");
const { isMarketingEnabled } = await import("@/lib/flags");
const { __setMockAuthorId } = (await import("@/lib/supabase/admin")) as Record<
  string,
  unknown
>;
const { POST } = await import("./route");

// ─── Helpers ────────────────────────────────────────────────────────────────
function makeRequest(
  body: Record<string, unknown> = { contentType: "text", channel: "ig" }
): Request {
  return new Request("http://localhost/api/books/book-1/content/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routeCtx = { params: Promise.resolve({ id: "book-1" }) };

function mockAuthSuccess(userId = "u1") {
  ((__setMockAuthorId) as (id: string) => void)(userId);
  vi.mocked(requireAuthorRoleForApi).mockResolvedValue({
    user: { id: userId } as never,
    response: null,
  });
}

function mockAuthFail(status = 401) {
  vi.mocked(requireAuthorRoleForApi).mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status }),
  });
}

function mockBillingOk() {
  vi.mocked(requireProBillingForApi).mockResolvedValue({
    ok: true,
    state: { isProActive: true } as never,
  });
}

function mockBillingFail() {
  vi.mocked(requireProBillingForApi).mockResolvedValue({
    ok: false,
    response: new Response(JSON.stringify({ error: "PRO_SUBSCRIPTION_REQUIRED" }), {
      status: 403,
    }),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe("security: POST /api/books/[id]/content/generate", () => {
  let userCounter = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    userCounter += 1;
    vi.mocked(isMarketingEnabled).mockReturnValue(true);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuthFail(401);
    const res = await POST(makeRequest(), routeCtx);
    expect(res.status).toBe(401);
  });

  it("returns 403 when author role is missing", async () => {
    mockAuthFail(403);
    const res = await POST(makeRequest(), routeCtx);
    expect(res.status).toBe(403);
  });

  it("returns 403 when marketing feature is disabled", async () => {
    mockAuthSuccess(`u-${userCounter}-marketing`);
    vi.mocked(isMarketingEnabled).mockReturnValue(false);
    const res = await POST(makeRequest(), routeCtx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("MARKETING_FEATURE_DISABLED");
  });

  it("returns 429 after exceeding rate limit", async () => {
    mockAuthSuccess("u-rate");
    mockBillingOk();

    // First 3 should succeed
    for (let i = 0; i < 3; i++) {
      const res = await POST(makeRequest(), routeCtx);
      expect(res.status).toBe(200);
    }

    // 4th should be rate-limited
    const res = await POST(makeRequest(), routeCtx);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("returns 403 when billing gate fails", async () => {
    mockAuthSuccess(`u-${userCounter}-billing`);
    mockBillingFail();
    const res = await POST(makeRequest(), routeCtx);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid request body", async () => {
    mockAuthSuccess(`u-${userCounter}-invalid-body`);
    mockBillingOk();
    const res = await POST(makeRequest({ contentType: "pdf", channel: "ig" }), routeCtx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when channel does not support content type", async () => {
    mockAuthSuccess(`u-${userCounter}-invalid-channel`);
    mockBillingOk();
    // x does not support video
    const res = await POST(makeRequest({ contentType: "video", channel: "x" }), routeCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("CONTENT_INVALID_CHANNEL_TYPE");
  });

  it("returns 200 for valid request", async () => {
    mockAuthSuccess(`u-${userCounter}-ok`);
    mockBillingOk();
    const res = await POST(makeRequest(), routeCtx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.assetId).toBeDefined();
  });

  it("guard order: auth → feature flag → rate limit → billing", async () => {
    // 1. Auth fails first
    mockAuthFail(401);
    vi.mocked(isMarketingEnabled).mockReturnValue(false);
    const res1 = await POST(makeRequest(), routeCtx);
    expect(res1.status).toBe(401);

    // 2. Feature flag fails after auth passes
    mockAuthSuccess(`u-${userCounter}-guard`);
    vi.mocked(isMarketingEnabled).mockReturnValue(false);
    const res2 = await POST(makeRequest(), routeCtx);
    expect(res2.status).toBe(403);
    const body2 = await res2.json();
    expect(body2.error).toBe("MARKETING_FEATURE_DISABLED");
  });
});
