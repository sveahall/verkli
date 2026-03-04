import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  assertPublicEnv: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/env", () => ({
  assertPublicEnv: mocks.assertPublicEnv,
}));

const { GET } = await import("./route");

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function mockAuthor(userId = "author-1") {
  mocks.requireAuthorRoleForApi.mockResolvedValue({ user: { id: userId }, response: null });
}

function mockUnauthorized() {
  mocks.requireAuthorRoleForApi.mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "NOT_AUTHENTICATED" }), { status: 401 }),
  });
}

describe("GET /api/books/[id]/chapters", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockUnauthorized();
    const res = await GET(new Request("http://localhost"), makeParams("book-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when book not found", async () => {
    mockAuthor();
    mockFrom.mockImplementation((table: string) => {
      if (table === "books") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        };
      }
      return {};
    });
    mocks.createClient.mockResolvedValue({ from: mockFrom });

    const res = await GET(new Request("http://localhost"), makeParams("book-1"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when book belongs to another author", async () => {
    mockAuthor("author-1");
    mockFrom.mockImplementation((table: string) => {
      if (table === "books") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "book-1", author_id: "other-author" },
                error: null,
              }),
            })),
          })),
        };
      }
      return {};
    });
    mocks.createClient.mockResolvedValue({ from: mockFrom });

    const res = await GET(new Request("http://localhost"), makeParams("book-1"));
    expect(res.status).toBe(404);
  });

  it("returns empty chapters when no book version exists", async () => {
    mockAuthor();
    mockFrom.mockImplementation((table: string) => {
      if (table === "books") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "book-1", author_id: "author-1" },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === "book_versions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                })),
              })),
            })),
          })),
        };
      }
      return {};
    });
    mocks.createClient.mockResolvedValue({ from: mockFrom });

    const res = await GET(new Request("http://localhost"), makeParams("book-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapters).toEqual([]);
  });

  it("returns chapters with normalized text", async () => {
    mockAuthor();
    mockFrom.mockImplementation((table: string) => {
      if (table === "books") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "book-1", author_id: "author-1" },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === "book_versions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "ver-1" },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }
      if (table === "chapters") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: "ch-1", title: "Intro", content: "Hello world", order: 0 },
                    { id: "ch-2", title: null, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Para text" }] }] }, order: 1 },
                  ],
                  error: null,
                }),
              })),
            })),
          })),
        };
      }
      return {};
    });
    mocks.createClient.mockResolvedValue({ from: mockFrom });

    const res = await GET(new Request("http://localhost"), makeParams("book-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapters).toHaveLength(2);
    expect(body.chapters[0].title).toBe("Intro");
    expect(body.chapters[0].text).toBe("Hello world");
    expect(body.chapters[1].title).toBe("Chapter 2");
    expect(body.chapters[1].text).toBe("Para text");
  });
});
