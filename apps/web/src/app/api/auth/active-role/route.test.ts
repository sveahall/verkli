import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/features/auth/roles", () => ({
  updateActiveRole: vi.fn(),
}));

// Force in-memory rate limiter (no Redis) so limits reset between test runs
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

const { POST } = await import("./route");

// Import after mocks are set up
const { updateActiveRole } = await import("@/features/auth/roles");

function mockAuthenticated(userId = "user-1") {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } } });
}

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/active-role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/active-role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the rate limiter between tests by re-importing is impractical,
    // so we use a unique user ID per test where rate limit matters.
  });

  it("returns 400 for invalid role", async () => {
    mockAuthenticated();
    const res = await POST(makeRequest({ role: "admin" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_ROLE");
  });

  it("returns 400 for missing role", async () => {
    mockAuthenticated();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();
    const res = await POST(makeRequest({ role: "author" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 for valid role switch", async () => {
    mockAuthenticated("valid-switch-user");
    vi.mocked(updateActiveRole).mockResolvedValue({ ok: true });

    const res = await POST(makeRequest({ role: "reader" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns 429 after exceeding rate limit", async () => {
    const userId = "rate-limit-test-user";
    mockAuthenticated(userId);
    vi.mocked(updateActiveRole).mockResolvedValue({ ok: true });

    // Burn through 10 allowed requests
    for (let i = 0; i < 10; i++) {
      const res = await POST(makeRequest({ role: "reader" }));
      expect(res.status).toBe(200);
    }

    // 11th request should be rate-limited
    const res = await POST(makeRequest({ role: "reader" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(body).toHaveProperty("retryAfterSeconds");
    expect(typeof body.retryAfterSeconds).toBe("number");
  });
});
