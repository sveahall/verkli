import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: vi.fn(),
}));

/** Swap to null to model "the campaign's book is not yours". */
let booksOwnershipRow: { id: string } | null = { id: "book-1" };

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
        // No `user_id` — the table has none. Ownership is decided by the book.
        return {
          select: vi.fn().mockReturnValue(
            chainableEq({
              data: { id: "camp-1", book_id: "book-1", status: "draft" },
              error: null,
            })
          ),
        };
      }
      if (table === "books") {
        // The route asks for the book filtered by BOTH id and author_id, so a
        // row coming back is the ownership proof itself.
        return {
          select: vi.fn().mockReturnValue(
            chainableEq({ data: booksOwnershipRow, error: null })
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

// Force in-memory rate limiter (no Redis) so _reset() works between tests
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

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
    role: "author",
    response: null,
  });
}

function mockAuthFail(status = 401) {
  vi.mocked(requireAuthorRoleForApi).mockResolvedValue({
    user: null,
    role: null,
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
    booksOwnershipRow = { id: "book-1" };
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

  it("404s when the campaign's book belongs to another author", async () => {
    // The check this replaced read `marketing_campaigns.user_id`, a column that
    // table does not have, so it failed closed on EVERY request — the route has
    // never once got past it. Now that it works at all, the refusal has to be
    // tested rather than assumed.
    mockAuthSuccess();
    mockBillingOk();
    booksOwnershipRow = null;

    const res = await POST(makeRequest());

    expect(res.status).toBe(404);
  });
});
