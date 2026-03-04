import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: vi.fn(),
}));

vi.mock("@/lib/higgsfield", () => ({
  generateImageToVideo: vi.fn(() =>
    Promise.resolve({ requestId: "req-1", videoUrl: "https://cdn.example.com/video.mp4" })
  ),
}));

const { requireAuthorRoleForApi } = await import(
  "@/lib/auth/require-author"
);
const { requireProBillingForApi } = await import("@/lib/billing/server");
const { generateImageToVideo } = await import("@/lib/higgsfield");
const { POST } = await import("./route");

// ─── Helpers ────────────────────────────────────────────────────────────────
function makeRequest(
  body: Record<string, unknown> = {
    promptText: "A sunset",
    imageUrl: "https://cdn.example.com/cover.jpg",
  }
): Request {
  return new Request("http://localhost/api/ai/text-to-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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
describe("security: POST /api/ai/text-to-video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuthFail(401);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when author role is missing", async () => {
    mockAuthFail(403);

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 403 when billing gate fails (no Pro)", async () => {
    mockAuthSuccess();
    mockBillingFail();

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 200 for authenticated author with Pro billing", async () => {
    mockAuthSuccess();
    mockBillingOk();

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("requestId");
    expect(body).toHaveProperty("videoUrl");
  });

  it("rate-limits after 5 requests per minute per user", async () => {
    mockAuthSuccess("u-rate");
    mockBillingOk();

    // First 5 should succeed
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
    }

    // 6th should be rate-limited
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("rate-limits are per-user — different users are independent", async () => {
    mockBillingOk();

    // Exhaust user A
    mockAuthSuccess("user-a");
    for (let i = 0; i < 5; i++) {
      await POST(makeRequest());
    }
    const resA = await POST(makeRequest());
    expect(resA.status).toBe(429);

    // User B should still work
    mockAuthSuccess("user-b");
    const resB = await POST(makeRequest());
    expect(resB.status).toBe(200);
  });

  it("returns 400 when promptText is missing", async () => {
    mockAuthSuccess();
    mockBillingOk();

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when imageUrl is missing", async () => {
    mockAuthSuccess();
    mockBillingOk();

    const res = await POST(makeRequest({ promptText: "A sunset" }));
    expect(res.status).toBe(400);
  });

  it("forwards audio=false to Higgsfield", async () => {
    mockAuthSuccess();
    mockBillingOk();

    const res = await POST(
      makeRequest({
        promptText: "A sunset",
        imageUrl: "https://cdn.example.com/cover.jpg",
        audio: false,
      })
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      expect.objectContaining({
        includeAudio: false,
      })
    );
  });
});
