import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn() },
    from: mockFrom,
  })),
}));

const { createClient } = await import("@/lib/supabase/server");

function mockSupabaseWithUser() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    from: mockFrom,
  } as never);
}

function mockSupabaseNoUser() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    from: mockFrom,
  } as never);
}

describe("GET /api/auth/sync-role", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockSupabaseNoUser();
    const req = new Request("http://localhost/api/auth/sync-role");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("redirects with role cookie when profile has active_role preference", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { role: "reader", preferences: { active_role: "author" } },
              error: null,
            }),
        }),
      }),
    });
    const req = new Request("http://localhost/api/auth/sync-role?redirect=/author/home");
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/author/home");
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("active_role");
  });

  it("redirects to / when no redirect param given", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { role: "reader", preferences: null },
              error: null,
            }),
        }),
      }),
    });
    const req = new Request("http://localhost/api/auth/sync-role");
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/");
  });

  it("falls back to profile.role when no active_role preference", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { role: "author", preferences: {} },
              error: null,
            }),
        }),
      }),
    });
    const req = new Request("http://localhost/api/auth/sync-role?redirect=/author/home");
    const res = await GET(req);
    expect(res.status).toBe(307);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("active_role");
  });
});
