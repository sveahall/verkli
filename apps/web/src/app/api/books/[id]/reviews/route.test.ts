import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_ALREADY_REVIEWED, E_FORBIDDEN } from "@/lib/api-errors";
import { createSupabaseClientMock } from "../../../_test-helpers/supabase";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  canUserReadBook: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/books/access", () => ({
  canUserReadBook: mocks.canUserReadBook,
}));

// Force in-memory rate limiter (no Redis)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

const { GET, POST } = await import("./route");

const BOOK_ID = "f5f2f4b5-29ca-4878-bf26-f4f149893414";
const USER_ID = "reader-1";
const AUTHOR_ID = "author-1";

describe("/api/books/[id]/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canUserReadBook.mockResolvedValue(true);
  });

  it("GET returns reviews", async () => {
    const reviewRow = {
      id: "review-1",
      user_id: USER_ID,
      book_id: BOOK_ID,
      book_version_id: null,
      rating: 5,
      content: "Fantastisk bok",
      created_at: "2026-02-01T10:00:00.000Z",
      updated_at: "2026-02-01T10:00:00.000Z",
    };

    let reviewFromCall = 0;

    const client = createSupabaseClientMock({
      userId: USER_ID,
      tables: {
        books: {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: BOOK_ID },
                error: null,
              })),
            })),
          })),
        },
        reviews: () => {
          reviewFromCall += 1;

          if (reviewFromCall === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    range: vi.fn(async () => ({
                      data: [reviewRow],
                      count: 1,
                      error: null,
                    })),
                  })),
                })),
              })),
            };
          }

          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: reviewRow,
                    error: null,
                  })),
                })),
              })),
            })),
          };
        },
        profiles: {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [{ user_id: USER_ID, display_name: "Läsare Ett", username: "reader1" }],
              error: null,
            })),
          })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const res = await GET(new Request(`http://localhost/api/books/${BOOK_ID}/reviews`), {
      params: Promise.resolve({ id: BOOK_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0]).toMatchObject({
      id: "review-1",
      rating: 5,
      reviewerName: "You",
      isMine: true,
    });
    expect(body.myReview).toMatchObject({ id: "review-1" });
    expect(body.totalCount).toBe(1);
    expect(body.hasMore).toBe(false);
  });

  it("POST creates a review for a user with book access", async () => {
    const createdReview = {
      id: "review-2",
      user_id: USER_ID,
      book_id: BOOK_ID,
      book_version_id: null,
      rating: 4,
      content: "Bra tempo",
      created_at: "2026-02-02T10:00:00.000Z",
      updated_at: "2026-02-02T10:00:00.000Z",
    };

    let booksCallCount = 0;
    const client = createSupabaseClientMock({
      userId: USER_ID,
      tables: {
        books: () => {
          booksCallCount++;
          // First call: ensureReadableBook (returns {id})
          // Second call: access check (returns {author_id, price_amount, pricing_model})
          if (booksCallCount === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: BOOK_ID },
                    error: null,
                  })),
                })),
              })),
            };
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { author_id: AUTHOR_ID, price_amount: 0, pricing_model: "book_only" },
                  error: null,
                })),
              })),
            })),
          };
        },
        reviews: {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: createdReview, error: null })),
            })),
          })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const req = new Request(`http://localhost/api/books/${BOOK_ID}/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rating: 4,
        content: "Bra tempo",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: BOOK_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.review).toMatchObject({
      id: "review-2",
      rating: 4,
      reviewerName: "You",
      isMine: true,
    });
    expect(mocks.canUserReadBook).toHaveBeenCalledTimes(1);
  });

  it("POST blocks review when user has no book access (paid book, no entitlement)", async () => {
    mocks.canUserReadBook.mockResolvedValue(false);

    let booksCallCount = 0;
    const client = createSupabaseClientMock({
      userId: USER_ID,
      tables: {
        books: () => {
          booksCallCount++;
          if (booksCallCount === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: BOOK_ID },
                    error: null,
                  })),
                })),
              })),
            };
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { author_id: AUTHOR_ID, price_amount: 9900, pricing_model: "book_only" },
                  error: null,
                })),
              })),
            })),
          };
        },
        reviews: {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const req = new Request(`http://localhost/api/books/${BOOK_ID}/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 5, content: "Fake review" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: BOOK_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe(E_FORBIDDEN);
    expect(mocks.canUserReadBook).toHaveBeenCalledTimes(1);
  });

  it("POST blocks author from reviewing own book", async () => {
    let booksCallCount = 0;
    const client = createSupabaseClientMock({
      userId: AUTHOR_ID,
      tables: {
        books: () => {
          booksCallCount++;
          if (booksCallCount === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: BOOK_ID },
                    error: null,
                  })),
                })),
              })),
            };
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { author_id: AUTHOR_ID, price_amount: 0, pricing_model: "book_only" },
                  error: null,
                })),
              })),
            })),
          };
        },
        reviews: {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const req = new Request(`http://localhost/api/books/${BOOK_ID}/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 5, content: "My own masterpiece" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: BOOK_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe(E_FORBIDDEN);
    // canUserReadBook should NOT be called — author check short-circuits first
    expect(mocks.canUserReadBook).not.toHaveBeenCalled();
  });

  it("POST returns E_ALREADY_REVIEWED on duplicate review", async () => {
    let booksCallCount = 0;
    const client = createSupabaseClientMock({
      userId: USER_ID,
      tables: {
        books: () => {
          booksCallCount++;
          if (booksCallCount === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: BOOK_ID },
                    error: null,
                  })),
                })),
              })),
            };
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { author_id: AUTHOR_ID, price_amount: 0, pricing_model: "book_only" },
                  error: null,
                })),
              })),
            })),
          };
        },
        reviews: {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: null,
                error: { code: "23505", message: "duplicate review" },
              })),
            })),
          })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const req = new Request(`http://localhost/api/books/${BOOK_ID}/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rating: 5,
        content: "Andra recensionen",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: BOOK_ID }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe(E_ALREADY_REVIEWED);
  });
});
