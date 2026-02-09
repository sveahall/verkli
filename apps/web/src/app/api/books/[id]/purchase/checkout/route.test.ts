import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_INVALID_BOOK_PRICING } from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  canUserReadBook: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  logAnalyticsEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/books/access", () => ({
  canUserReadBook: mocks.canUserReadBook,
}));

vi.mock("@/lib/payments/stripe", () => ({
  createStripeCheckoutSession: mocks.createStripeCheckoutSession,
}));

vi.mock("@/lib/analytics/events", () => ({
  logAnalyticsEvent: mocks.logAnalyticsEvent,
}));

const { POST } = await import("./route");

function makeSupabaseClient(book: Record<string, unknown> | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "reader-1",
            email: "reader@example.com",
          },
        },
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== "books") throw new Error(`Unexpected table ${table}`);

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: book, error: null })),
          })),
        })),
      };
    }),
  };
}

function makeAdminClient() {
  const state = {
    insertedOrder: null as Record<string, unknown> | null,
    updatePayloads: [] as Record<string, unknown>[],
  };

  const ordersInsertSelectSingle = vi.fn(async () => ({ data: { id: "order-1" }, error: null }));

  const client = {
    from: vi.fn((table: string) => {
      if (table === "orders") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            state.insertedOrder = payload;
            return {
              select: vi.fn(() => ({
                single: ordersInsertSelectSingle,
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            state.updatePayloads.push(payload);
            return {
              eq: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
            };
          }),
        };
      }

      throw new Error(`Unexpected admin table ${table}`);
    }),
  };

  return { client, state };
}

describe("POST /api/books/[id]/purchase/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canUserReadBook.mockResolvedValue(false);
    mocks.logAnalyticsEvent.mockResolvedValue(undefined);
    mocks.createStripeCheckoutSession.mockResolvedValue({
      id: "cs_test_1",
      url: "https://checkout.stripe.test/session",
    });
  });

  it("uses exact amount and currency from DB pricing", async () => {
    const supabase = makeSupabaseClient({
      id: "book-1",
      title: "Paid Book",
      author_id: "author-1",
      status: "PUBLISHED",
      price_amount: 1299,
      price_currency: "SEK",
      pricing_model: "book_only",
    });
    const admin = makeAdminClient();

    mocks.createClient.mockResolvedValue(supabase);
    mocks.createAdminClient.mockReturnValue(admin.client);

    const res = await POST(new Request("http://localhost/api/books/book-1/purchase/checkout", { method: "POST" }), {
      params: Promise.resolve({ id: "book-1" }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(admin.state.insertedOrder).toMatchObject({ amount: 1299, currency: "SEK" });
    expect(admin.state.updatePayloads).toContainEqual({ stripe_session_id: "cs_test_1" });
    expect(mocks.canUserReadBook).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "book-1",
        bookAuthorId: "author-1",
        bookPriceAmount: 1299,
        bookPricingModel: "book_only",
      })
    );
    expect(mocks.createStripeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1299, currency: "SEK" })
    );
    expect(body).toMatchObject({
      orderId: "order-1",
      amount: 1299,
      currency: "SEK",
    });
  });

  it("rejects checkout when stored pricing is invalid", async () => {
    const supabase = makeSupabaseClient({
      id: "book-1",
      title: "Paid Book",
      author_id: "author-1",
      status: "PUBLISHED",
      price_amount: 1299,
      price_currency: "JPY",
      pricing_model: "book_only",
    });

    mocks.createClient.mockResolvedValue(supabase);
    mocks.createAdminClient.mockReturnValue(makeAdminClient().client);

    const res = await POST(new Request("http://localhost/api/books/book-1/purchase/checkout", { method: "POST" }), {
      params: Promise.resolve({ id: "book-1" }),
    });

    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe(E_INVALID_BOOK_PRICING);
    expect(mocks.createStripeCheckoutSession).not.toHaveBeenCalled();
  });
});
