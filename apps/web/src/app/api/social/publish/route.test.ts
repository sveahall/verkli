import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: vi.fn(),
}));

function chainableEq(terminal: Record<string, unknown>) {
  const handler: Record<string, unknown> = {};
  handler.eq = vi.fn().mockReturnValue(handler);
  handler.in = vi.fn().mockReturnValue(handler);
  handler.maybeSingle = vi.fn().mockResolvedValue(terminal);
  return handler;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "marketing_campaigns") {
        return {
          select: vi.fn().mockReturnValue(
            chainableEq({
              data: { id: "camp-1", book_id: "book-1", user_id: "u1", status: "draft" },
              error: null,
            })
          ),
        };
      }
      if (table === "ai_jobs") {
        return {
          select: vi.fn().mockReturnValue(
            chainableEq({ data: null, error: null })
          ),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "job-1" }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      // fallback
      return {
        select: vi.fn().mockReturnValue(
          chainableEq({ data: null, error: null })
        ),
      };
    }),
  })),
}));

vi.mock("@/lib/social-publish-queue", () => ({
  enqueueSocialPublishJob: vi.fn().mockResolvedValue("job-1"),
}));

const { requireAuthorRoleForApi } = await import("@/lib/auth/require-author");
const { requireProBillingForApi } = await import("@/lib/billing/server");
const { POST } = await import("./route");

import { resetSocialRateLimits } from "@/lib/social/rate-limit";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown> = { campaignId: "camp-1", platforms: ["x"] }): Request {
  return new Request("http://localhost/api/social/publish", {
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
    response: new Response(JSON.stringify({ error: "PRO_SUBSCRIPTION_REQUIRED" }), { status: 403 }),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/social/publish", () => {
  const originalEnv = process.env.SOCIAL_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSocialRateLimits();
    process.env.SOCIAL_ENABLED = "true";
    process.env.NEXT_PUBLIC_SOCIAL_ENABLED = "true";
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

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("SOCIAL_FEATURE_DISABLED");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuthFail(401);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when no Pro subscription", async () => {
    mockAuthSuccess();
    mockBillingFail();

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("PRO_SUBSCRIPTION_REQUIRED");
  });

  it("returns 429 after 5 requests per minute", async () => {
    mockAuthSuccess("u1");
    mockBillingOk();

    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest());
      expect(res.status).toBe(202);
    }

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("returns 400 for invalid platform", async () => {
    mockAuthSuccess();
    mockBillingOk();

    const res = await POST(makeRequest({ campaignId: "camp-1", platforms: ["fakebook"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("SOCIAL_INVALID_PLATFORM");
  });

  it("returns 202 with jobId for valid request", async () => {
    mockAuthSuccess();
    mockBillingOk();

    const res = await POST(makeRequest());
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.jobId).toBeDefined();
    expect(body.status).toBe("pending");
  });
});
