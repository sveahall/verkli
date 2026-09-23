import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn() },
    from: mockFrom,
  })),
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: vi.fn(() => Promise.resolve({ ok: true })),
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

describe("GET /api/credits/balance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockSupabaseNoUser();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns balance when authenticated", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { token_balance: 500 },
              error: null,
            }),
        }),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("balance", 500);
  });

  it("returns 0 balance when no row exists", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: null,
              error: null,
            }),
        }),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("balance", 0);
  });

  it("returns 500 when database query fails", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: null,
              error: { code: "PGRST", message: "connection failed" },
            }),
        }),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
