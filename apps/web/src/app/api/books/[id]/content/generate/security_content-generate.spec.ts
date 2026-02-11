import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: vi.fn(),
}));

vi.mock("@/lib/flags", () => ({
  isMarketingEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "book-1", author_id: "u1" },
        error: null,
      }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    })),
  })),
}));

vi.mock("@/lib/ai/content-generation", () => ({
  ContentGenerationRequestSchema: (await import("@/lib/ai/content-generation/schemas")).ContentGenerationRequestSchema,
  CHANNEL_CONSTRAINTS: (await import("@/lib/ai/content-generation/schemas")).CHANNEL_CONSTRAINTS,
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
}));

const { requireAuthorRoleForApi } = await import("@/lib/auth/require-author");
const { requireProBillingForApi } = await import("@/lib/billing/server");
const { isMarketingEnabled } = await import("@/lib/flags");
const { POST, _rateLimiter } = await import("./route");

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
  beforeEach(() => {
    vi.clearAllMocks();
    _rateLimiter._reset();
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
    mockAuthSuccess();
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
    mockAuthSuccess();
    mockBillingFail();
    const res = await POST(makeRequest(), routeCtx);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid request body", async () => {
    mockAuthSuccess();
    mockBillingOk();
    const res = await POST(makeRequest({ contentType: "pdf", channel: "ig" }), routeCtx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when channel does not support content type", async () => {
    mockAuthSuccess();
    mockBillingOk();
    // x does not support video
    const res = await POST(makeRequest({ contentType: "video", channel: "x" }), routeCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("CONTENT_INVALID_CHANNEL_TYPE");
  });

  it("returns 200 for valid request", async () => {
    mockAuthSuccess();
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
    mockAuthSuccess();
    vi.mocked(isMarketingEnabled).mockReturnValue(false);
    const res2 = await POST(makeRequest(), routeCtx);
    expect(res2.status).toBe(403);
    const body2 = await res2.json();
    expect(body2.error).toBe("MARKETING_FEATURE_DISABLED");
  });
});
