import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }),
  })),
}));

vi.mock("@/lib/social/oauth-state", () => ({
  createOAuthState: vi.fn().mockReturnValue("mock-state-token"),
}));

vi.mock("@/lib/social/oauth", () => ({
  buildOAuthUrl: vi.fn().mockReturnValue("https://twitter.com/oauth?state=mock-state-token"),
}));

vi.mock("@/lib/social/token-crypto", () => ({
  encryptToken: vi.fn().mockReturnValue("encrypted-mock"),
}));

// Force in-memory rate limiter (no Redis) so _reset() works between tests
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null };
});

const { requireAuthorRoleForApi } = await import("@/lib/auth/require-author");
const { requireProBillingForApi } = await import("@/lib/billing/server");
const { POST } = await import("./route");

import { resetSocialRateLimits } from "@/lib/social/rate-limit";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(platform = "x"): [Request, { params: Promise<{ platform: string }> }] {
  return [
    new Request(`http://localhost/api/social/connect/${platform}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ platform }) },
  ];
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
    response: new Response(JSON.stringify({ error: "PRO_SUBSCRIPTION_REQUIRED" }), { status: 403 }),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/social/connect/[platform]", () => {
  const originalEnv = process.env.SOCIAL_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSocialRateLimits();
    process.env.SOCIAL_ENABLED = "true";
    process.env.NEXT_PUBLIC_SOCIAL_ENABLED = "true";
    process.env.SOCIAL_OAUTH_STATE_SECRET = "test-secret-for-oauth-state";
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SOCIAL_ENABLED;
      delete process.env.NEXT_PUBLIC_SOCIAL_ENABLED;
    } else {
      process.env.SOCIAL_ENABLED = originalEnv;
    }
  });

  it("returns 403 E_SOCIAL_FEATURE_DISABLED when social is disabled", async () => {
    process.env.SOCIAL_ENABLED = "false";
    process.env.NEXT_PUBLIC_SOCIAL_ENABLED = "false";

    const [req, ctx] = makeRequest();
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("SOCIAL_FEATURE_DISABLED");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuthFail(401);

    const [req, ctx] = makeRequest();
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 when no Pro subscription", async () => {
    mockAuthSuccess();
    mockBillingFail();

    const [req, ctx] = makeRequest();
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("PRO_SUBSCRIPTION_REQUIRED");
  });

  it("returns 429 after 5 requests per minute", async () => {
    mockAuthSuccess("u-rate");
    mockBillingOk();

    for (let i = 0; i < 5; i++) {
      const [req, ctx] = makeRequest();
      const res = await POST(req, ctx);
      expect(res.status).toBe(200);
    }

    const [req, ctx] = makeRequest();
    const res = await POST(req, ctx);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("returns 400 for invalid platform", async () => {
    mockAuthSuccess();
    mockBillingOk();

    const [req, ctx] = makeRequest("fakebook");
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("SOCIAL_INVALID_PLATFORM");
  });

  it("returns 200 with authUrl for valid platform", async () => {
    mockAuthSuccess();
    mockBillingOk();

    const [req, ctx] = makeRequest("x");
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authUrl).toBeDefined();
    expect(body.authUrl).toContain("twitter.com");
  });
});
