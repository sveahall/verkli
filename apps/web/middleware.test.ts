import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const originalBETA_LOCK = process.env.BETA_LOCK;
const originalNEXT_PUBLIC_WAITLIST_ONLY = process.env.NEXT_PUBLIC_WAITLIST_ONLY;
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockGetAuthorApplicationStatus = vi.fn(() => Promise.resolve(null));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

vi.mock("@/lib/auth/beta", () => ({
  isBetaUser: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@/lib/auth/author-approval", () => ({
  getAuthorApplicationStatus: mockGetAuthorApplicationStatus,
}));

describe("middleware beta lock", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_WAITLIST_ONLY = "false";
    process.env.BETA_LOCK = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFrom.mockReset();
    mockGetAuthorApplicationStatus.mockReset();
    mockGetAuthorApplicationStatus.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env.BETA_LOCK = originalBETA_LOCK;
    process.env.NEXT_PUBLIC_WAITLIST_ONLY = originalNEXT_PUBLIC_WAITLIST_ONLY;
  });

  it("returns 403 for API when BETA_LOCK=true and user not beta", async () => {
    const { middleware } = await import("./middleware");
    const req = new NextRequest("http://localhost/api/books");
    const res = await middleware(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty("error", "Beta access required");
  });

  it("redirects to /waitlist for page when BETA_LOCK=true and user not beta", async () => {
    const { middleware } = await import("./middleware");
    const req = new NextRequest("http://localhost/author/home");
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/waitlist");
  });
});

describe("middleware author access", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_WAITLIST_ONLY = "false";
    process.env.BETA_LOCK = "false";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    mockGetUser.mockResolvedValue({ data: { user: { id: "reader-1" } } });
    mockGetAuthorApplicationStatus.mockResolvedValue(null);
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { role: "reader" }, error: null }),
            }),
          }),
        };
      }
      return {};
    });
  });

  afterEach(() => {
    mockFrom.mockReset();
    mockGetUser.mockReset();
    mockGetAuthorApplicationStatus.mockReset();
  });

  it("sets active_role=reader when redirecting non-approved user away from /author/home", async () => {
    const { middleware } = await import("./middleware");
    const req = new NextRequest("http://localhost/author/home", {
      headers: { cookie: "active_role=author" },
    });
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/reader/home?error=author_required");
    expect(res.headers.get("set-cookie") ?? "").toContain("active_role=reader");
  });

  it("allows admin users on /author routes without redirect", async () => {
    // Use a distinct user id so the in-middleware role cache from the
    // previous test ("reader-1" → reader) does not leak into this one.
    mockGetUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { role: "admin" }, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const { middleware } = await import("./middleware");
    const req = new NextRequest("http://localhost/author/tts-lab");
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
