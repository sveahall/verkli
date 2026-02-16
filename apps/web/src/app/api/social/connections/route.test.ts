import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSelect = vi.fn().mockReturnValue({
  data: [
    {
      id: "conn-1",
      platform: "x",
      platform_username: "testuser",
      status: "active",
      token_expires_at: null,
      connected_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
  error: null,
});

const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ from: mockFrom, auth: { getUser: vi.fn() } })
  ),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: vi.fn(),
}));

const { requireAuthorRoleForApi } = await import("@/lib/auth/require-author");
const { requireProBillingForApi } = await import("@/lib/billing/server");
const { GET } = await import("./route");

// ─── Helpers ────────────────────────────────────────────────────────────────

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

describe("GET /api/social/connections", () => {
  const originalEnv = process.env.SOCIAL_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
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

    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("SOCIAL_FEATURE_DISABLED");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuthFail(401);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when no Pro subscription", async () => {
    mockAuthSuccess();
    mockBillingFail();

    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("PRO_SUBSCRIPTION_REQUIRED");
  });

  it("queries social_connections_safe view (not base table)", async () => {
    mockAuthSuccess();
    mockBillingOk();

    await GET();

    expect(mockFrom).toHaveBeenCalledWith("social_connections_safe");
  });

  it("returns connections with no token fields", async () => {
    mockAuthSuccess();
    mockBillingOk();

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.connections).toHaveLength(1);
    const conn = body.connections[0];
    expect(conn).toHaveProperty("id");
    expect(conn).toHaveProperty("platform");
    expect(conn).toHaveProperty("platform_username");
    expect(conn).toHaveProperty("status");
    // Must NOT have token fields
    expect(conn).not.toHaveProperty("access_token_enc");
    expect(conn).not.toHaveProperty("refresh_token_enc");
    expect(conn).not.toHaveProperty("email_config_enc");
  });
});
