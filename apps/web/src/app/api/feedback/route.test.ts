import { describe, it, expect, vi, beforeEach } from "vitest";

// Force in-memory rate limiter (no Redis)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

import { POST, GET } from "./route";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn() },
    from: mockFrom,
  })),
}));

const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

const { createClient } = await import("@/lib/supabase/server");
const { createAdminClient } = await import("@/lib/supabase/admin");

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
      from: mockFrom,
    } as never);
  });

  it("returns 400 for invalid type", async () => {
    mockFrom.mockReturnValue({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }),
    });

    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "invalid", message: "Hello" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 and inserts feedback for valid payload", async () => {
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: { id: "fb-1", created_at: new Date().toISOString() },
              error: null,
            }),
        }),
      }),
    });

    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bug", message: "Something broke" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id", "fb-1");
    expect(body).toHaveProperty("created_at");
  });

  // Regression: the live `feedback` RLS policy has drifted from its migration and
  // rejects anonymous inserts, so the primary CTA on /support returned
  // FEEDBACK_SAVE_FAILED for exactly the signed-out readers the page exists for.
  // Anonymous writes therefore go through the service role.
  it("writes anonymous feedback through the service role, not the anon session", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
      from: mockFrom,
    } as never);
    mockAdminFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: { id: "fb-anon", created_at: new Date().toISOString() },
              error: null,
            }),
        }),
      }),
    });

    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "other", message: "I cannot access my purchase" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(createAdminClient).toHaveBeenCalled();
    expect(mockAdminFrom).toHaveBeenCalledWith("feedback");
    // The user-scoped client must not be the writer here — that is the path that fails.
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("keeps authenticated feedback on the user-scoped client so RLS still applies", async () => {
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: { id: "fb-anon", created_at: new Date().toISOString() },
              error: null,
            }),
        }),
      }),
    });

    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bug", message: "Signed-in report" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("feedback");
    // Never hand the service role a write it does not need.
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe("GET /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: mockFrom,
    } as never);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 and list when authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
      from: mockFrom,
    } as never);
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [{ id: "fb-1", status: "new" }], error: null }),
        }),
      }),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("feedback");
    expect(Array.isArray(body.feedback)).toBe(true);
  });
});
