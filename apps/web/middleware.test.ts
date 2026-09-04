import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { BetaCheckTransientError } from "@/lib/auth/beta";

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

// vi.hoisted lifts this above the hoisted vi.mock factories. Without it the
// static BetaCheckTransientError import below runs the factory during module
// evaluation, before this const initializes, and the file dies in the TDZ.
const mockIsBetaUser = vi.hoisted(() => vi.fn(() => Promise.resolve(false)));

// importActual keeps the real BetaCheckTransientError class, so `err instanceof
// BetaCheckTransientError` inside middleware resolves against the same class the
// tests throw. A hand-rolled stub would make that check silently false.
vi.mock("@/lib/auth/beta", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/beta")>(
    "@/lib/auth/beta"
  );
  return { ...actual, isBetaUser: mockIsBetaUser };
});

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

  // The dead end this guards: the lock allowed /auth, which is only the OAuth
  // callback and the reset-password screen. Every sign-in form sits elsewhere,
  // so a beta tester without a session was bounced to /waitlist and had no way
  // to reach a login page — the lock locked out the people it was built for.
  it.each([
    "/signin",
    "/signup",
    "/forgot-password",
    "/reader/signin",
    "/reader/signup",
    "/reader/forgot-password",
    "/author/signin",
    "/author/signup",
    "/author/forgot-password",
  ])("lets a non-beta visitor reach %s so they can log in", async (path) => {
    const { middleware } = await import("./middleware");
    const res = await middleware(new NextRequest(`http://localhost${path}`));
    // Asserting only that the beta lock did not send them to the waitlist. An
    // allowed path has no location header at all; route protection further down
    // may still redirect for its own reasons, and that is not this test's
    // business.
    const location = res.headers.get("location") ?? "";
    expect(location).not.toContain("/waitlist");
  });

  it("still bounces a lookalike path that is not an exact auth route", async () => {
    const { middleware } = await import("./middleware");
    const res = await middleware(new NextRequest("http://localhost/signin/secret"));
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

// ---------------------------------------------------------------------------
// wp/17 — the buy button must survive both site locks.
//
// The book pre-order form is rendered ON the waitlist page, and the order API
// is a separate path. Neither allowlist mentioned /order, so a POST was 307'd
// to /waitlist (client parses HTML as JSON -> generic error) under
// WAITLIST_ONLY, or 403'd under BETA_LOCK. The page looked fine both times;
// only the purchase failed.
// ---------------------------------------------------------------------------
describe("middleware order paths survive the site locks", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockFrom.mockReset();
    mockGetAuthorApplicationStatus.mockReset();
    mockGetAuthorApplicationStatus.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env.BETA_LOCK = originalBETA_LOCK;
    process.env.NEXT_PUBLIC_WAITLIST_ONLY = originalNEXT_PUBLIC_WAITLIST_ONLY;
  });

  describe("under NEXT_PUBLIC_WAITLIST_ONLY", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_WAITLIST_ONLY = "true";
      process.env.BETA_LOCK = "false";
    });

    it.each(["/api/order/ta-for-er", "/order/ta-for-er/success"])(
      "lets %s through instead of redirecting it to /waitlist",
      async (path) => {
        const { middleware } = await import("./middleware");
        const res = await middleware(new NextRequest(`http://localhost${path}`));
        expect(res.headers.get("location") ?? "").not.toContain("/waitlist");
      }
    );

    // This allowlist is the ONLY gate under this lock — an allowed path returns
    // NextResponse.next() before Supabase init, so it never reaches the /author
    // role check or the /reader auth check. Surfaced by security review. The
    // traversal cases matter because the URL parser collapses dot-segments
    // BEFORE middleware sees the path, so they must arrive already resolved to
    // their real target and be bounced on that basis.
    it.each([
      "/author/books",
      "/reader/library",
      "/order/ta-for-er/../../author/books",
      "/api/order/ta-for-er/../../api/admin/users",
    ])("never lets %s onto the unauthenticated fast path", async (path) => {
      const { middleware } = await import("./middleware");
      const res = await middleware(new NextRequest(`http://localhost${path}`));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/waitlist");
    });

    // Tripwires for the two "hardening" changes that would actually open this
    // gate, per rule 3 of the CAUTION comment in middleware.ts. Both were
    // mutation-tested: each one fails under the change it names.
    //
    // The case variant fails if anyone lowercases the slug (or the path) before
    // the Set lookup, e.g. PUBLIC_ORDER_SLUGS.has(slug.toLowerCase()). Note it
    // does NOT fail merely from adding /i to ORDER_PATH_PATTERN — the exactness
    // lives in the Set lookup, not the regex, so /i alone changes nothing. That
    // is worth knowing before someone "simplifies" one into the other.
    //
    // The encoded-slash variant fails if anyone calls decodeURIComponent on the
    // path before matching. Today %2f stays literal, so the whole tail is one
    // segment and the slug lookup misses. Decode first and the slug becomes
    // "ta-for-er", the path is cleared, and the router still resolves the
    // un-decoded string — the divergence this predicate is built to avoid.
    it.each([
      "/api/order/TA-FOR-ER",
      "/api/order/ta-for-er%2f..%2fapi%2fadmin",
    ])("keeps %s locked, so the predicate stays exact", async (path) => {
      const { middleware } = await import("./middleware");
      const res = await middleware(new NextRequest(`http://localhost${path}`));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/waitlist");
    });

    it("still redirects an unrelated page to /waitlist", async () => {
      const { middleware } = await import("./middleware");
      const res = await middleware(new NextRequest("http://localhost/reader/discover"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/waitlist");
    });

    // The allowlist must stay an allowlist. A bare startsWith("/order") would
    // also open the first three; the last two are the fail-closed property —
    // an order route for a product nobody registered stays locked.
    it.each([
      "/orders",
      "/api/orders",
      "/order-admin",
      "/order/some-future-product",
      "/api/order/some-future-product",
    ])(
      "still bounces the lookalike path %s",
      async (path) => {
        const { middleware } = await import("./middleware");
        const res = await middleware(new NextRequest(`http://localhost${path}`));
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toContain("/waitlist");
      }
    );
  });

  describe("under BETA_LOCK", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_WAITLIST_ONLY = "false";
      process.env.BETA_LOCK = "true";
    });

    it("does not 403 the order API for a visitor who is not a beta user", async () => {
      const { middleware } = await import("./middleware");
      const res = await middleware(new NextRequest("http://localhost/api/order/ta-for-er"));
      expect(res.status).not.toBe(403);
    });

    it("does not bounce the Stripe return page to /waitlist", async () => {
      const { middleware } = await import("./middleware");
      const res = await middleware(
        new NextRequest("http://localhost/order/ta-for-er/success")
      );
      expect(res.headers.get("location") ?? "").not.toContain("/waitlist");
    });

    it("still 403s an unrelated API path for a non-beta visitor", async () => {
      const { middleware } = await import("./middleware");
      const res = await middleware(new NextRequest("http://localhost/api/books"));
      expect(res.status).toBe(403);
    });

    // Fail closed on the axis that actually varies: which products are public.
    it("still 403s an order API for a product that is not registered", async () => {
      const { middleware } = await import("./middleware");
      const res = await middleware(
        new NextRequest("http://localhost/api/order/some-future-product")
      );
      expect(res.status).toBe(403);
    });

    // Found by codex review. Allowing the path is not enough on its own: the
    // beta lookup ran for every request carrying a session, and a transient
    // user_flags failure returns 503 before allowedPath is consulted. A buyer
    // who happens to be logged in would lose the buy button to an outage in
    // cohort storage the sale does not depend on.
    describe("when the buyer carries a session and the beta check is failing", () => {
      beforeEach(() => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "buyer-session-1" } } });
        mockIsBetaUser.mockRejectedValue(
          new BetaCheckTransientError("user_flags unavailable")
        );
      });

      afterEach(() => {
        mockIsBetaUser.mockImplementation(() => Promise.resolve(false));
      });

      it.each(["/api/order/ta-for-er", "/order/ta-for-er/success"])(
        "does not 503 %s, because the lookup cannot change the outcome",
        async (path) => {
          const { middleware } = await import("./middleware");
          const res = await middleware(new NextRequest(`http://localhost${path}`));
          expect(res.status).not.toBe(503);
        }
      );

      // The maintenance response is correct where membership actually decides
      // access. Do not weaken it.
      it("still 503s a gated API path, where membership decides access", async () => {
        const { middleware } = await import("./middleware");
        const res = await middleware(new NextRequest("http://localhost/api/books"));
        expect(res.status).toBe(503);
      });
    });
  });
});
