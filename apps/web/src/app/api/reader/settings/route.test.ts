import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PUT } from "./route";

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

describe("GET /api/reader/settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockSupabaseNoUser();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns default settings when profile has no preferences", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { preferences: null }, error: null }),
        }),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.settings).toMatchObject({
      font_family: "serif",
      font_size: 18,
      theme: "light",
    });
  });

  it("returns stored settings from preferences", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: {
                preferences: {
                  reader: {
                    settings: { font_family: "mono", font_size: 22, theme: "dark" },
                  },
                },
              },
              error: null,
            }),
        }),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.font_family).toBe("mono");
    expect(body.settings.font_size).toBe(22);
    expect(body.settings.theme).toBe("dark");
  });

  it("returns 500 when database query fails", async () => {
    mockSupabaseWithUser();
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: null, error: { message: "db error" } }),
        }),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/reader/settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockSupabaseNoUser();
    const req = new Request("http://localhost/api/reader/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ font_size: 20 }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid json", async () => {
    mockSupabaseWithUser();
    const req = new Request("http://localhost/api/reader/settings", {
      method: "PUT",
      body: "not-json",
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid settings values", async () => {
    mockSupabaseWithUser();
    const req = new Request("http://localhost/api/reader/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ font_size: 999 }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("updates settings successfully", async () => {
    mockSupabaseWithUser();
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { preferences: {} }, error: null }),
            }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      return {};
    });
    const req = new Request("http://localhost/api/reader/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ font_size: 20, theme: "sepia" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.settings.font_size).toBe(20);
    expect(body.settings.theme).toBe("sepia");
  });
});
