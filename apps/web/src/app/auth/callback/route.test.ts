import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEXT_PATH_COOKIE } from "@/lib/auth/next-path";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  capturePostHogAsync: vi.fn(),
  createAdminClient: vi.fn(),
  grantBetaAccessIfInvited: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/analytics/posthog-server", () => ({
  capturePostHogAsync: mocks.capturePostHogAsync,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/auth/beta", () => ({
  grantBetaAccessIfInvited: mocks.grantBetaAccessIfInvited,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
}));

const { GET } = await import("./route");

const ORIGIN = "https://verkli.test";

function makeSupabase(options?: {
  exchangeError?: { message: string } | null;
  role?: "reader" | "author" | null;
}) {
  const role = options?.role === undefined ? "reader" : options.role;
  return {
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({
        error: options?.exchangeError ?? null,
      })),
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "user-1",
            email: "buyer@example.com",
            created_at: "2020-01-01T00:00:00Z",
            user_metadata: role ? { active_role: role } : {},
            app_metadata: { provider: "google" },
          },
        },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null })),
        })),
      })),
    })),
  };
}

function makeRequest(query: string, cookie?: string): Request {
  return new Request(`${ORIGIN}/auth/callback${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

function setCookieValues(res: Response): string[] {
  const getSetCookie = (res.headers as unknown as {
    getSetCookie?: () => string[];
  }).getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(res.headers);
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

describe("GET /auth/callback", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = ORIGIN;
    mocks.capturePostHogAsync.mockResolvedValue(undefined);
    mocks.createClient.mockResolvedValue(makeSupabase());
    mocks.createAdminClient.mockReturnValue({});
    mocks.grantBetaAccessIfInvited.mockResolvedValue({ granted: true });
  });

  afterEach(() => {
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it("honours ?next= so an OAuth buyer lands back on the book", async () => {
    const res = await GET(makeRequest("?code=abc&next=%2Freader%2Fbooks%2Fbook-1"));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/reader/books/book-1`);
  });

  it("honours the carry cookie set before the provider hand-off", async () => {
    const res = await GET(
      makeRequest(
        "?code=abc",
        `${NEXT_PATH_COOKIE}=${encodeURIComponent("/reader/books/book-2")}`,
      ),
    );

    expect(res.headers.get("location")).toBe(`${ORIGIN}/reader/books/book-2`);
  });

  it("prefers an explicit ?next= over a stale cookie", async () => {
    const res = await GET(
      makeRequest(
        "?code=abc&next=%2Freader%2Flibrary",
        `${NEXT_PATH_COOKIE}=${encodeURIComponent("/reader/books/stale")}`,
      ),
    );

    expect(res.headers.get("location")).toBe(`${ORIGIN}/reader/library`);
  });

  it("clears the carry cookie so it cannot hijack a later sign-in", async () => {
    const res = await GET(
      makeRequest("?code=abc", `${NEXT_PATH_COOKIE}=${encodeURIComponent("/reader/library")}`),
    );

    const cleared = setCookieValues(res).find((value) =>
      value.startsWith(`${NEXT_PATH_COOKIE}=`),
    );
    expect(cleared).toBeDefined();
    expect(cleared).toContain("Max-Age=0");
  });

  it("still sets the active role cookie alongside the cleared carry cookie", async () => {
    const res = await GET(makeRequest("?code=abc&next=%2Freader%2Flibrary"));

    const cookies = setCookieValues(res).join("\n");
    expect(cookies).toContain("active_role=reader");
    expect(cookies).toContain(`${NEXT_PATH_COOKIE}=`);
  });

  it("falls back to the role home when there is no next", async () => {
    const res = await GET(makeRequest("?code=abc"));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/reader/home`);
  });

  it("sends an author to the author home when there is no next", async () => {
    mocks.createClient.mockResolvedValue(makeSupabase({ role: "author" }));

    const res = await GET(makeRequest("?code=abc"));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/author/home`);
  });

  describe("open redirect protection", () => {
    // A redirect the attacker controls, reached through our own trusted domain,
    // is a working phishing funnel. Every one of these must land on our origin.
    const payloads = [
      ["absolute URL", "https%3A%2F%2Fevil.com%2Fharvest"],
      ["protocol-relative", "%2F%2Fevil.com"],
      ["backslash variant", "%2F%5Cevil.com"],
      ["mixed slashes", "%2F%5C%2Fevil.com"],
      ["encoded double slash", "%2F%252F%252Fevil.com"],
      ["javascript scheme", "javascript%3Aalert(1)"],
      ["bare host", "evil.com"],
    ] as const;

    for (const [label, encoded] of payloads) {
      it(`refuses ${label} on the query string`, async () => {
        const res = await GET(makeRequest(`?code=abc&next=${encoded}`));

        const location = res.headers.get("location") ?? "";
        expect(location).toBe(`${ORIGIN}/reader/home`);
        expect(location).not.toContain("evil.com");
      });

      it(`refuses ${label} in the carry cookie`, async () => {
        const res = await GET(makeRequest("?code=abc", `${NEXT_PATH_COOKIE}=${encoded}`));

        const location = res.headers.get("location") ?? "";
        expect(location).toBe(`${ORIGIN}/reader/home`);
        expect(location).not.toContain("evil.com");
      });
    }

    it("refuses a next that loops back to sign-in", async () => {
      const res = await GET(makeRequest("?code=abc&next=%2Freader%2Fsignin"));

      expect(res.headers.get("location")).toBe(`${ORIGIN}/reader/home`);
    });
  });

  it("sends an auth error to the root when the code exchange fails", async () => {
    mocks.createClient.mockResolvedValue(
      makeSupabase({ exchangeError: { message: "bad code" } }),
    );

    const res = await GET(makeRequest("?code=bad&next=%2Freader%2Fbooks%2F1"));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/?error=auth`);
  });

  it("sends a missing code to the root", async () => {
    const res = await GET(makeRequest(""));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/?error=auth`);
  });

  it("lets an invited person through the beta lock without an admin", async () => {
    await GET(makeRequest("?code=abc"));

    expect(mocks.grantBetaAccessIfInvited).toHaveBeenCalledWith(
      expect.anything(),
      { userId: "user-1", email: "buyer@example.com" },
    );
  });

  it("still signs the user in when the beta grant fails", async () => {
    // The grant is a convenience. If it breaks, the person lands on /waitlist
    // and an admin toggles them in — turning a valid sign-in into ?error=auth
    // would be strictly worse.
    mocks.grantBetaAccessIfInvited.mockRejectedValue(new Error("service role down"));

    const res = await GET(makeRequest("?code=abc&next=%2Freader%2Flibrary"));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/reader/library`);
    expect(mocks.captureException).toHaveBeenCalled();
  });

  it("reports a grant that returned an error instead of dropping it", async () => {
    mocks.grantBetaAccessIfInvited.mockResolvedValue({
      granted: false,
      reason: "error",
      error: "connection reset",
    });

    await GET(makeRequest("?code=abc"));

    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("connection reset") }),
      expect.anything(),
    );
  });

  it("does not report a person who simply was not invited", async () => {
    mocks.grantBetaAccessIfInvited.mockResolvedValue({
      granted: false,
      reason: "not_invited",
    });

    await GET(makeRequest("?code=abc"));

    expect(mocks.captureException).not.toHaveBeenCalled();
  });

});
