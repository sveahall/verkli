import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  E_UNAUTHORIZED,
  E_BOOK_NOT_FOUND,
  E_CHECKOUT_SESSION_FAILED,
  E_INVALID_BOOK_ID,
  E_INVALID_REQUEST_BODY,
} from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  assertPublicEnv: vi.fn(),
  createPodCheckoutSession: vi.fn(),
  getStripeCheckoutSession: vi.fn(),
  logAnalyticsEvent: vi.fn(),
  normalizePrintOnDemandSettings: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    assertPublicEnv: mocks.assertPublicEnv,
    getRedisUrl: () => null,
    getRedisConnectionOptions: () => undefined,
    getRedisClientOptions: () => undefined,
  };
});

vi.mock("@/lib/payments/stripe", () => ({
  createPodCheckoutSession: mocks.createPodCheckoutSession,
  getStripeCheckoutSession: mocks.getStripeCheckoutSession,
}));

vi.mock("@/lib/analytics/events", () => ({
  logAnalyticsEvent: (...args: unknown[]) => mocks.logAnalyticsEvent(...args),
}));

vi.mock("@/lib/print-on-demand", () => ({
  normalizePrintOnDemandSettings: (...args: unknown[]) =>
    mocks.normalizePrintOnDemandSettings(...args),
}));

const { POST } = await import("./route");

const VALID_UUID = "00000000-0000-4000-8000-000000000001";

function makeRequest(payload: unknown) {
  return new Request(
    `http://localhost/api/books/${VALID_UUID}/pod/checkout`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

function mockAuthedUser(userId = "reader-1") {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: userId, email: "reader@example.com" } },
        }),
    },
    from,
  });

  return { from, maybeSingle };
}

function mockNoUser() {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
    },
  });
}

function mockBookLookup(
  supabaseFrom: ReturnType<typeof vi.fn>,
  maybeSingle: ReturnType<typeof vi.fn>,
  opts: { found: boolean; authorId?: string; status?: string; podSettings?: unknown }
) {
  maybeSingle.mockResolvedValue({
    data: opts.found
      ? {
          id: VALID_UUID,
          title: "Test Book",
          author_id: opts.authorId ?? "other-author",
          status: opts.status ?? "PUBLISHED",
          print_on_demand_settings: opts.podSettings ?? {},
        }
      : null,
    error: null,
  });
}

function mockAdminClient() {
  // Build a chainable eq mock that returns itself for arbitrary depth
  function chainableEq(resolvedValue: unknown) {
    const eqFn: ReturnType<typeof vi.fn> = vi.fn(() => proxy);
    const proxy = new Proxy(
      { eq: eqFn },
      {
        get(_target, prop) {
          if (prop === "eq") return eqFn;
          if (prop === "then") {
            // Make it thenable so `await` resolves to the value
            return (resolve: (v: unknown) => void) => resolve(resolvedValue);
          }
          return undefined;
        },
      }
    );
    return proxy;
  }

  // Idempotency check: select -> eq (x5) -> not -> gte -> order -> limit -> maybeSingle
  const idempotencyMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const idempotencyLimit = vi.fn(() => ({ maybeSingle: idempotencyMaybeSingle }));
  const idempotencyOrder = vi.fn(() => ({ limit: idempotencyLimit }));
  const idempotencyGte = vi.fn(() => ({ order: idempotencyOrder }));
  const idempotencyNot = vi.fn(() => ({ gte: idempotencyGte }));
  const idempotencyEq5 = vi.fn(() => ({ not: idempotencyNot }));
  const idempotencyEq4 = vi.fn(() => ({ eq: idempotencyEq5 }));
  const idempotencyEq3 = vi.fn(() => ({ eq: idempotencyEq4 }));
  const idempotencyEq2 = vi.fn(() => ({ eq: idempotencyEq3 }));
  const idempotencyEq1 = vi.fn(() => ({ eq: idempotencyEq2 }));
  const idempotencySelect = vi.fn(() => ({ eq: idempotencyEq1 }));

  // Insert order: insert -> select -> single
  const insertSingle = vi.fn().mockResolvedValue({
    data: { id: "pod-order-1" },
    error: null,
  });
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));

  // Update order: update -> eq -> eq -> eq (resolves to { error: null })
  const update = vi.fn(() => chainableEq({ error: null }));

  const from = vi.fn(() => ({
    select: idempotencySelect,
    insert,
    update,
  }));

  mocks.createAdminClient.mockReturnValue({ from });
  return { from, insertSingle };
}

describe("POST /api/books/[id]/pod/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPublicEnv.mockReturnValue(undefined);
    mocks.logAnalyticsEvent.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockNoUser();

    const res = await POST(makeRequest({ format: "softcover" }), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe(E_UNAUTHORIZED);
  });

  it("returns 400 for invalid book ID", async () => {
    mockAuthedUser();

    const res = await POST(makeRequest({ format: "softcover" }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe(E_INVALID_BOOK_ID);
  });

  it("returns 400 when format is missing", async () => {
    mockAuthedUser();

    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe(E_INVALID_REQUEST_BODY);
  });

  it("returns 404 when book is not found", async () => {
    const { from, maybeSingle } = mockAuthedUser();
    mockBookLookup(from, maybeSingle, { found: false });

    const res = await POST(makeRequest({ format: "softcover" }), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe(E_BOOK_NOT_FOUND);
  });

  it("returns 200 with checkout url on valid request", async () => {
    const { from, maybeSingle } = mockAuthedUser();
    mockBookLookup(from, maybeSingle, {
      found: true,
      authorId: "other-author",
      podSettings: {},
    });

    mocks.normalizePrintOnDemandSettings.mockReturnValue({
      enabled: true,
      formats: ["softcover", "hardcover"],
      softcoverPriceMinor: 19900,
      hardcoverPriceMinor: 29900,
      priceCurrency: "SEK",
    });

    mockAdminClient();
    mocks.createPodCheckoutSession.mockResolvedValue({
      id: "cs_test_pod",
      url: "https://checkout.stripe.com/cs_test_pod",
    });

    const res = await POST(makeRequest({ format: "softcover" }), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checkoutUrl).toContain("stripe.com");
    expect(body.podOrderId).toBe("pod-order-1");
  });

  it("returns 500 when Stripe session creation fails", async () => {
    const { from, maybeSingle } = mockAuthedUser();
    mockBookLookup(from, maybeSingle, {
      found: true,
      authorId: "other-author",
      podSettings: {},
    });

    mocks.normalizePrintOnDemandSettings.mockReturnValue({
      enabled: true,
      formats: ["softcover"],
      softcoverPriceMinor: 19900,
      hardcoverPriceMinor: null,
      priceCurrency: "SEK",
    });

    mockAdminClient();
    mocks.createPodCheckoutSession.mockRejectedValue(
      new Error("Stripe API down")
    );

    const res = await POST(makeRequest({ format: "softcover" }), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(E_CHECKOUT_SESSION_FAILED);
  });
});
