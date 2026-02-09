import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  E_INVALID_BOOK_PRICING,
  E_INVALID_PRICE_CURRENCY,
  E_INVALID_PRICING_COMBINATION,
} from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

const { PATCH, GET } = await import("./route");

type BookRow = {
  id: string;
  title: string;
  author_id: string;
  price_amount: number | null;
  price_currency: string | null;
  pricing_model: string;
  is_free?: boolean;
  updated_at?: string;
};

function makeBooksSupabase(options: {
  book: BookRow | null;
  updatedBook?: BookRow | null;
  selectError?: { message: string; code?: string } | null;
  updateError?: { message: string; code?: string } | null;
}) {
  const state = {
    updates: null as Record<string, unknown> | null,
  };

  const selectChain = {
    eq: vi.fn(() => selectChain),
    maybeSingle: vi.fn(async () => ({ data: options.book, error: options.selectError ?? null })),
  };

  const updateSelectChain = {
    single: vi.fn(async () => ({ data: options.updatedBook ?? options.book, error: options.updateError ?? null })),
  };

  const updateSecondEqChain = {
    select: vi.fn(() => updateSelectChain),
  };

  const updateFirstEqChain = {
    eq: vi.fn(() => updateSecondEqChain),
  };

  const updateChain = {
    eq: vi.fn(() => updateFirstEqChain),
  };

  const from = vi.fn((table: string) => {
    if (table !== "books") {
      throw new Error(`Unexpected table ${table}`);
    }

    return {
      select: vi.fn(() => selectChain),
      update: vi.fn((updates: Record<string, unknown>) => {
        state.updates = updates;
        return updateChain;
      }),
    };
  });

  return {
    client: { from },
    state,
  };
}

describe("/api/books/[id] pricing settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({ from: vi.fn() });
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "author-1" },
      response: null,
    });
  });

  it("returns 404 when book is not owned by author", async () => {
    const supabase = makeBooksSupabase({
      book: {
        id: "book-1",
        title: "Book",
        author_id: "other-author",
        price_amount: 0,
        price_currency: "USD",
        pricing_model: "book_only",
      },
    });
    mocks.createClient.mockResolvedValue(supabase.client);

    const res = await PATCH(
      new Request("http://localhost/api/books/book-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ price_amount: 100, price_currency: "USD" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(404);
  });

  it("rejects invalid currency allowlist", async () => {
    const supabase = makeBooksSupabase({
      book: {
        id: "book-1",
        title: "Book",
        author_id: "author-1",
        price_amount: 0,
        price_currency: "USD",
        pricing_model: "book_only",
      },
    });
    mocks.createClient.mockResolvedValue(supabase.client);

    const res = await PATCH(
      new Request("http://localhost/api/books/book-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ price_amount: 200, price_currency: "JPY" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe(E_INVALID_PRICE_CURRENCY);
  });

  it("rejects paid mode without paid amount", async () => {
    const supabase = makeBooksSupabase({
      book: {
        id: "book-1",
        title: "Book",
        author_id: "author-1",
        price_amount: 0,
        price_currency: "USD",
        pricing_model: "book_only",
      },
    });
    mocks.createClient.mockResolvedValue(supabase.client);

    const res = await PATCH(
      new Request("http://localhost/api/books/book-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_free: false }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe(E_INVALID_PRICING_COMBINATION);
  });

  it("updates pricing and returns normalized settings", async () => {
    const supabase = makeBooksSupabase({
      book: {
        id: "book-1",
        title: "Book",
        author_id: "author-1",
        price_amount: 0,
        price_currency: "USD",
        pricing_model: "book_only",
        is_free: true,
      },
      updatedBook: {
        id: "book-1",
        title: "Book",
        author_id: "author-1",
        price_amount: 1299,
        price_currency: "SEK",
        pricing_model: "book_only",
        is_free: false,
        updated_at: "2026-02-07T10:00:00.000Z",
      },
    });
    mocks.createClient.mockResolvedValue(supabase.client);

    const res = await PATCH(
      new Request("http://localhost/api/books/book-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ price_amount: 1299, price_currency: "sek", pricing_model: "book_only" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(supabase.state.updates).toEqual({
      price_amount: 1299,
      price_currency: "SEK",
      pricing_model: "book_only",
    });
    expect(body.price_amount).toBe(1299);
    expect(body.price_currency).toBe("SEK");
    expect(body.pricing_model).toBe("book_only");
    expect(body.is_free).toBe(false);
  });

  it("GET returns pricing settings for owner", async () => {
    const supabase = makeBooksSupabase({
      book: {
        id: "book-1",
        title: "Book",
        author_id: "author-1",
        price_amount: 0,
        price_currency: "USD",
        pricing_model: "book_only",
        is_free: true,
        updated_at: "2026-02-07T10:00:00.000Z",
      },
    });
    mocks.createClient.mockResolvedValue(supabase.client);

    const res = await GET(new Request("http://localhost/api/books/book-1"), {
      params: Promise.resolve({ id: "book-1" }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      id: "book-1",
      price_amount: 0,
      price_currency: "USD",
      pricing_model: "book_only",
      is_free: true,
    });
  });

  it("GET returns safe error key when stored pricing is invalid", async () => {
    const supabase = makeBooksSupabase({
      book: {
        id: "book-1",
        title: "Book",
        author_id: "author-1",
        price_amount: 499,
        price_currency: "JPY",
        pricing_model: "book_only",
      },
    });
    mocks.createClient.mockResolvedValue(supabase.client);

    const res = await GET(new Request("http://localhost/api/books/book-1"), {
      params: Promise.resolve({ id: "book-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(E_INVALID_BOOK_PRICING);
  });

  it("GET allows free pricing with null currency and normalizes response currency", async () => {
    const supabase = makeBooksSupabase({
      book: {
        id: "book-1",
        title: "Book",
        author_id: "author-1",
        price_amount: 0,
        price_currency: null,
        pricing_model: "book_only",
        is_free: true,
      },
    });
    mocks.createClient.mockResolvedValue(supabase.client);

    const res = await GET(new Request("http://localhost/api/books/book-1"), {
      params: Promise.resolve({ id: "book-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.price_amount).toBe(0);
    expect(body.price_currency).toBe("USD");
    expect(body.is_free).toBe(true);
  });

  it("PATCH allows free pricing with null currency and does not return 500", async () => {
    const supabase = makeBooksSupabase({
      book: {
        id: "book-1",
        title: "Book",
        author_id: "author-1",
        price_amount: 0,
        price_currency: null,
        pricing_model: "book_only",
        is_free: true,
      },
      updatedBook: {
        id: "book-1",
        title: "Book",
        author_id: "author-1",
        price_amount: 0,
        price_currency: null,
        pricing_model: "book_only",
        is_free: true,
        updated_at: "2026-02-09T12:00:00.000Z",
      },
    });
    mocks.createClient.mockResolvedValue(supabase.client);

    const res = await PATCH(
      new Request("http://localhost/api/books/book-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_free: true }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.price_amount).toBe(0);
    expect(body.price_currency).toBe("USD");
    expect(body.is_free).toBe(true);
  });
});
