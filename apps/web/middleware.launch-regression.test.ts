import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression: launch QA found Stripe's signed webhook blocked by BETA_LOCK,
// while the subscription/config checks passed. 2026-09-10.
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isBetaUser: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/auth/beta", async (original) => ({
  ...(await original<typeof import("@/lib/auth/beta")>()),
  isBetaUser: mocks.isBetaUser,
}));
const { middleware } = await import("./middleware");

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.verkli.com");
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.isBetaUser.mockResolvedValue(false);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe.each([
  { beta: "true", waitlist: "false" },
  { beta: "false", waitlist: "true" },
  { beta: "true", waitlist: "true" },
])("launch gates beta=$beta waitlist=$waitlist", ({ beta, waitlist }) => {
  beforeEach(() => {
    vi.stubEnv("BETA_LOCK", beta);
    vi.stubEnv("NEXT_PUBLIC_WAITLIST_ONLY", waitlist);
  });

  it("lets Stripe POST reach its signature verifier without browser auth", async () => {
    mocks.getUser.mockRejectedValue(new Error("Auth service unavailable"));
    const response = await middleware(new NextRequest("https://www.verkli.com/api/stripe/webhook", {
      method: "POST", body: "{}",
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it.each(["/api/health", "/api/health/workers", "/api/health/workers/crashes", "/api/health/queue", "/api/health/metrics/queue"])(
    "lets GET %s reach its own admin/ops check", async (path) => {
      mocks.getUser.mockRejectedValue(new Error("Auth service unavailable"));
      const response = await middleware(new NextRequest(`https://www.verkli.com${path}`));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(mocks.getUser).not.toHaveBeenCalled();
    }
  );

  it.each(["/privacy", "/terms", "/support"])("keeps %s available to buyers", async (path) => {
    const response = await middleware(new NextRequest(`https://www.verkli.com${path}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets the public support form reach its validation after CSRF checks", async () => {
    const response = await middleware(new NextRequest("https://www.verkli.com/api/feedback", {
      method: "POST", body: "{}", headers: { origin: "https://www.verkli.com" },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("still rejects a cross-site support submission", async () => {
    const response = await middleware(new NextRequest("https://www.verkli.com/api/feedback", {
      method: "POST", body: "{}", headers: { origin: "https://untrusted.example", "sec-fetch-site": "cross-site" },
    }));
    expect(response.status).toBe(403);
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it.each(["/api/stripe/webhook/private", "/api/stripe/webhooks", "/api/health/private", "/api/health/workers/private", "/api/feedback", "/privacy/private", "/author/home"])(
    "does not exempt the lookalike or workspace route %s", async (path) => {
      const response = await middleware(new NextRequest(`https://www.verkli.com${path}`));
      expect(response.headers.get("x-middleware-next")).toBeNull();
      expect([307, 403]).toContain(response.status);
    }
  );
});

it("explains a signed-in user's missing invitation without opening the platform", async () => {
  vi.stubEnv("BETA_LOCK", "true");
  vi.stubEnv("NEXT_PUBLIC_WAITLIST_ONLY", "false");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "awaiting-invitation" } } });
  const response = await middleware(new NextRequest("https://www.verkli.com/author/home"));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("https://www.verkli.com/waitlist?access=pending");
});
