import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const originalBETA_LOCK = process.env.BETA_LOCK;
const originalNEXT_PUBLIC_WAITLIST_ONLY = process.env.NEXT_PUBLIC_WAITLIST_ONLY;

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }),
    },
  })),
}));

vi.mock("@/lib/auth/beta", () => ({
  isBetaUser: vi.fn(() => Promise.resolve(false)),
}));

describe("middleware beta lock", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_WAITLIST_ONLY = "false";
    process.env.BETA_LOCK = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
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
