import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The half of the e-book flow that cannot be clicked through.
 *
 * Stripe's card fields live in cross-origin iframes, so no automated run can
 * complete a Checkout payment. That left the most important branch — what
 * happens AFTER someone pays — provable only by paying, which is a bad place
 * to discover that the gate refuses real buyers or hands files to people who
 * bought something else. These tests stand in for the payment.
 */

const mocks = vi.hoisted(() => ({
  getStripeCheckoutSession: vi.fn(),
  isStripeConfigured: vi.fn(() => true),
  createAdminClient: vi.fn(),
  rateLimitCheck: vi.fn(),
  list: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock("@/lib/payments/stripe", () => ({
  getStripeCheckoutSession: mocks.getStripeCheckoutSession,
  isStripeConfigured: mocks.isStripeConfigured,
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({
    check: (...args: unknown[]) => mocks.rateLimitCheck(...args),
  }),
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    getRedisUrl: () => null,
    getRedisConnectionOptions: () => undefined,
    getRedisClientOptions: () => undefined,
  };
});

const { GET } = await import("./route");

const SESSION = "cs_test_abc123";
const SIGNED = "https://storage.example/signed/ta-for-er.pdf?token=x";

/** A Stripe session shaped the way a real paid e-book order is. */
function paidEbookSession() {
  return {
    payment_status: "paid",
    metadata: { payment_kind: "book_order", order_variant: "ebook" },
  };
}

/** Both files present in the bucket. */
function bucketHasBoth() {
  mocks.list.mockImplementation(async (_dir: string, opts: { search?: string }) => ({
    data: [{ name: opts?.search }],
    error: null,
  }));
}

function makeRequest(query: string) {
  return new Request(`http://localhost/api/order/ta-for-er/download${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isStripeConfigured.mockReturnValue(true);
  mocks.rateLimitCheck.mockResolvedValue({ allowed: true });
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null });
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.createAdminClient.mockReturnValue({
    storage: {
      from: () => ({
        list: (...a: unknown[]) => mocks.list(...a),
        createSignedUrl: (...a: unknown[]) => mocks.createSignedUrl(...a),
      }),
    },
  });
});

describe("GET /api/order/ta-for-er/download", () => {
  it("redirects a paying buyer to a signed URL", async () => {
    mocks.getStripeCheckoutSession.mockResolvedValue(paidEbookSession());
    bucketHasBoth();

    const res = await GET(makeRequest(`?session_id=${SESSION}&format=pdf`));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SIGNED);
  });

  it("lists only the formats whose file is actually in the bucket", async () => {
    // The config names PDF and EPUB. Only the PDF has been uploaded, so
    // offering EPUB would be a button that 404s after someone has paid.
    mocks.getStripeCheckoutSession.mockResolvedValue(paidEbookSession());
    mocks.list.mockImplementation(async (_dir: string, opts: { search?: string }) => ({
      data: opts?.search?.endsWith(".pdf") ? [{ name: opts.search }] : [],
      error: null,
    }));

    const res = await GET(makeRequest(`?session_id=${SESSION}`));
    const body = (await res.json()) as { formats: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(body.formats.map((f) => f.id)).toEqual(["pdf"]);
  });

  it("refuses a format that has no file, rather than signing a missing path", async () => {
    mocks.getStripeCheckoutSession.mockResolvedValue(paidEbookSession());
    mocks.list.mockResolvedValue({ data: [], error: null });

    const res = await GET(makeRequest(`?session_id=${SESSION}&format=epub`));

    expect(res.status).toBe(404);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("refuses someone who bought the printed copy", async () => {
    // The load-bearing check. Without the order_variant test, every 249 kr
    // paperback order — including ones placed before the e-book existed —
    // would also unlock the file.
    mocks.getStripeCheckoutSession.mockResolvedValue({
      payment_status: "paid",
      metadata: { payment_kind: "book_order", order_variant: "print" },
    });
    bucketHasBoth();

    const res = await GET(makeRequest(`?session_id=${SESSION}&format=pdf`));

    expect(res.status).toBe(403);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("refuses an unpaid session", async () => {
    mocks.getStripeCheckoutSession.mockResolvedValue({
      payment_status: "unpaid",
      metadata: { payment_kind: "book_order", order_variant: "ebook" },
    });
    bucketHasBoth();

    const res = await GET(makeRequest(`?session_id=${SESSION}&format=pdf`));

    expect(res.status).toBe(403);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("refuses a paid session that is not one of our book orders", async () => {
    // A paid donation or subscription session id must not buy a book.
    mocks.getStripeCheckoutSession.mockResolvedValue({
      payment_status: "paid",
      metadata: { payment_kind: "donation", order_variant: "ebook" },
    });
    bucketHasBoth();

    const res = await GET(makeRequest(`?session_id=${SESSION}&format=pdf`));

    expect(res.status).toBe(403);
  });

  it("refuses a session id Stripe does not know", async () => {
    mocks.getStripeCheckoutSession.mockRejectedValue(new Error("No such checkout.session"));

    const res = await GET(makeRequest(`?session_id=cs_test_madeup&format=pdf`));

    expect(res.status).toBe(403);
  });

  it("answers the same way whether the session is unpaid, foreign or missing", async () => {
    // Distinguishable answers would let someone probe session ids for status.
    const bodies: string[] = [];
    for (const session of [
      { payment_status: "unpaid", metadata: { payment_kind: "book_order", order_variant: "ebook" } },
      { payment_status: "paid", metadata: { payment_kind: "book_order", order_variant: "print" } },
    ]) {
      mocks.getStripeCheckoutSession.mockResolvedValue(session);
      const res = await GET(makeRequest(`?session_id=${SESSION}&format=pdf`));
      bodies.push(`${res.status}:${await res.text()}`);
    }
    mocks.getStripeCheckoutSession.mockRejectedValue(new Error("No such checkout.session"));
    const missing = await GET(makeRequest(`?session_id=${SESSION}&format=pdf`));
    bodies.push(`${missing.status}:${await missing.text()}`);

    expect(new Set(bodies).size).toBe(1);
  });

  it("requires a session id at all", async () => {
    const res = await GET(makeRequest(`?format=pdf`));
    expect(res.status).toBe(400);
    expect(mocks.getStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it("does not reach Stripe when rate limited", async () => {
    mocks.rateLimitCheck.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });

    const res = await GET(makeRequest(`?session_id=${SESSION}&format=pdf`));

    expect(res.status).toBe(429);
    expect(mocks.getStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it("fails loudly when signing breaks instead of redirecting nowhere", async () => {
    mocks.getStripeCheckoutSession.mockResolvedValue(paidEbookSession());
    bucketHasBoth();
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: "storage down" } });

    const res = await GET(makeRequest(`?session_id=${SESSION}&format=pdf`));

    expect(res.status).toBe(500);
  });
});
