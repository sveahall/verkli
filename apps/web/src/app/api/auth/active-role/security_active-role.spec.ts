import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
  ),
}));

vi.mock("@/lib/auth/author-approval", () => ({
  getAuthorApplicationStatus: vi.fn(() => Promise.resolve(null)),
}));

const { POST } = await import("./route");

// ─── Helpers ────────────────────────────────────────────────────────────────
function makeRequest(role: string): Request {
  return new Request("http://localhost/api/auth/active-role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

function mockUser(id: string, metadataRole?: string) {
  return { id, user_metadata: metadataRole ? { role: metadataRole } : {} };
}

function mockProfileSelect(role: string | null, preferences: Record<string, unknown> | null = null) {
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: { role, preferences }, error: null }),
      }),
    }),
    upsert: () => Promise.resolve({ error: null }),
  }));
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe("security: POST /api/auth/active-role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 (not 401) when reader tries to switch to author", async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser("u1") } });
    mockProfileSelect("reader");

    const res = await POST(makeRequest("author"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("FORBIDDEN");
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest("author"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("NOT_AUTHENTICATED");
  });

  it("returns 400 for invalid role value", async () => {
    const req = new Request("http://localhost/api/auth/active-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 when author switches to reader", async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser("u1") } });
    mockProfileSelect("author");

    const res = await POST(makeRequest("reader"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 403 when metadata says author but profiles.role says reader", async () => {
    // Core security test: metadata spoofing must not bypass
    mockGetUser.mockResolvedValue({ data: { user: mockUser("u1", "author") } });
    mockProfileSelect("reader");

    const res = await POST(makeRequest("author"));
    expect(res.status).toBe(403);
  });
});
