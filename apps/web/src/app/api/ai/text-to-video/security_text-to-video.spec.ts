import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/marketing-queue", () => ({
  enqueueTextToVideoJob: vi.fn(),
}));

const { requireAuthorRoleForApi } = await import(
  "@/lib/auth/require-author"
);
const { requireProBillingForApi } = await import("@/lib/billing/server");
const { createAdminClient } = await import("@/lib/supabase/admin");
const { enqueueTextToVideoJob } = await import("@/lib/marketing-queue");
const { POST } = await import("./route");

// ─── Helpers ────────────────────────────────────────────────────────────────
function makeRequest(body: Record<string, unknown> = { promptText: "A sunset" }): Request {
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

function mockAdminCreateJob(jobId = "job-1") {
  const single = vi.fn().mockResolvedValue({
    data: { id: jobId },
    error: null,
  });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const eq = vi.fn(() => ({ eq: vi.fn() }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    if (table === "ai_jobs") return { insert, update };
    throw new Error(`Unexpected table: ${table}`);
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe("security: POST /api/ai/text-to-video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminCreateJob();
    vi.mocked(enqueueTextToVideoJob).mockResolvedValue("job-1");
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

  it("returns 202 for authenticated author with Pro billing", async () => {
    mockAuthSuccess();
    mockBillingOk();

    const res = await POST(makeRequest());
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toHaveProperty("jobId", "job-1");
    expect(body).toHaveProperty("status", "pending");
  });

  it("rate-limits after 5 requests per minute per user", async () => {
    mockAuthSuccess("u-rate");
    mockBillingOk();

    // First 5 should succeed
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest());
      expect(res.status).toBe(202);
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
    expect(resB.status).toBe(202);
  });

  it("returns 400 when promptText is missing", async () => {
    mockAuthSuccess();
    mockBillingOk();

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });
});
