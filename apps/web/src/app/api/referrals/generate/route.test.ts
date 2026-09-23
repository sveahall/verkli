import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn() },
    from: mockFrom,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
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

describe("POST /api/referrals/generate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockSupabaseNoUser();
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns existing code when user already has one", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { code: "EXISTING1" },
              error: null,
            }),
        }),
      }),
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe("EXISTING1");
  });

  it("generates and inserts new code when none exists", async () => {
    mockSupabaseWithUser();
    mockFrom.mockImplementation((table: string) => {
      if (table === "referral_codes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      return {};
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.code).toBe("string");
    expect(body.code.length).toBe(8);
  });

  it("retries on unique constraint violation", async () => {
    mockSupabaseWithUser();
    let insertAttempts = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "referral_codes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: () => {
            insertAttempts++;
            if (insertAttempts === 1) {
              return Promise.resolve({ error: { code: "23505", message: "duplicate" } });
            }
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(insertAttempts).toBe(2);
  });
});
