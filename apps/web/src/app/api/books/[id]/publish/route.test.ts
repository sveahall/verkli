import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  E_AUTHOR_DISPLAY_NAME_REQUIRED,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_MISSING_BOOK_TITLE,
  E_MISSING_COVER_IMAGE,
  E_NO_BOOK_VERSION_TO_PUBLISH,
  E_NO_CHAPTERS,
  E_CHAPTER_NEEDS_CONTENT,
} from "@/lib/api-errors";

const BOOK_ID = "00000000-0000-4000-8000-000000000001";
const VERSION_ID = "00000000-0000-4000-8000-000000000002";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  getBookAsOwner: vi.fn(),
  assertPublicEnv: vi.fn(),
  logAnalyticsEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/books/service", () => ({
  getBookAsOwner: mocks.getBookAsOwner,
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
vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({
    check: () => ({ allowed: true }),
    _reset: () => {},
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/analytics/events", () => ({ logAnalyticsEvent: mocks.logAnalyticsEvent }));

const { POST } = await import("./route");

function makeRequest(payload: unknown) {
  return new Request(`http://localhost/api/books/${BOOK_ID}/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function makeParams(id = BOOK_ID) {
  return { params: Promise.resolve({ id }) };
}

/**
 * Build a mock Supabase client with chainable methods.
 * Each table call can be pre-configured with specific return values.
 */
function buildSupabaseMock({
  version = {
    id: VERSION_ID,
    book_id: BOOK_ID,
    published_at: null as string | null,
    visibility: "public",
    published_chapter_count: null as number | null,
  },
  versionError = null as { code?: string; message?: string } | null,
  chapters = [{ id: "ch-1", content: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello world"}]}]}' }] as
    | { id: string; content: string | null }[]
    | null,
  defaultVersion = { id: VERSION_ID } as { id: string } | null,
  anyVersion = null as { id: string } | null,
  beforeVersionUpdate = () => {},
  updateError = null as { message?: string } | null,
  authorProfile = { display_name: "Author Name", username: null as string | null } as
    | { display_name: string | null; username: string | null }
    | null,
}: {
  version?: {
    id: string;
    book_id: string;
    published_at: string | null;
    visibility: string;
    published_chapter_count: number | null;
    status?: string;
    updated_at?: string;
  } | null;
  versionError?: { code?: string; message?: string } | null;
  chapters?: { id: string; content: string | null }[] | null;
  defaultVersion?: { id: string } | null;
  anyVersion?: { id: string } | null;
  beforeVersionUpdate?: () => void;
  updateError?: { message?: string } | null;
  authorProfile?: { display_name: string | null; username: string | null } | null;
} = {}) {
  if (version) {
    version.status ??= "draft";
    version.updated_at ??= "2026-09-16T10:00:00.123456Z";
  }
  const versionUpdates: Record<string, unknown>[] = [];
  // Track version select calls to differentiate between version lookups
  let versionSelectCount = 0;

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "book_versions") {
        return {
          select: vi.fn(() => {
            versionSelectCount++;
            if (versionSelectCount === 1) {
              // Default version lookup (by book_id + language_code)
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: defaultVersion,
                      error: null,
                    }),
                  })),
                })),
              };
            }
            if (versionSelectCount === 2) {
              // Fallback any-version lookup (by book_id, order, limit)
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: defaultVersion,
                      error: null,
                    }),
                  })),
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: anyVersion ?? defaultVersion,
                        error: null,
                      }),
                    })),
                  })),
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: version ? { ...version } : null,
                    error: versionError,
                  }),
                })),
              };
            }
            // Version details lookup (by versionId) and post-unpublish
            // sibling-version check (.eq().not().limit()).
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: version ? { ...version } : null,
                  error: versionError,
                }),
                not: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                })),
              })),
            };
          }),
          update: vi.fn((values: Record<string, unknown>) => {
            const filters: Array<[string, unknown]> = [];
            const execute = () => {
              beforeVersionUpdate();
              const matched = version && filters.every(([key, value]) => (version as Record<string, unknown>)[key] === value);
              if (matched && !updateError) { versionUpdates.push(values); Object.assign(version, values); }
              return { data: matched && !updateError ? { id: VERSION_ID } : null, error: updateError };
            };
            const query = {
              eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
              select: () => query,
              maybeSingle: async () => execute(),
              then: (resolve: (value: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
            };
            return query;
          }),
        };
      }
      if (table === "chapters") {
        return { select: vi.fn(() => {
          let chapterId: string | null = null;
          const rows = () => chapters?.map((chapter, order) => ({ order, ...chapter })) ?? null;
          const query = {
            eq: (key: string, value: string) => { if (key === "id") chapterId = value; return query; },
            order: () => ({ data: rows(), error: null }),
            maybeSingle: async () => ({ data: rows()?.find((chapter) => chapter.id === chapterId) ?? null, error: null }),
          };
          return query;
        }) };
      }
      if (table === "books") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: updateError }),
          })),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: authorProfile,
                error: null,
              }),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    }),
  };

  mocks.createClient.mockResolvedValue(supabase);
  return { ...supabase, versionUpdates };
}

describe("POST /api/books/[id]/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "author-1" },
      response: null,
    });
    mocks.assertPublicEnv.mockReturnValue(undefined);
  });

  it("returns auth error when not authenticated", async () => {
    const authResponse = new Response(
      JSON.stringify({ error: "UNAUTHORIZED" }),
      { status: 401 },
    );
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "" },
      response: authResponse,
    });

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid book ID", async () => {
    const res = await POST(
      makeRequest({}),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_INVALID_BOOK_ID);
  });

  it("returns 404 when book is not found", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: false,
      error: "book_not_found",
    });

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe(E_BOOK_NOT_FOUND);
  });

  it("returns 404 when book is not owned by user", async () => {
    // getBookAsOwner returns book_not_found for both missing and not-owned
    mocks.getBookAsOwner.mockResolvedValue({
      ok: false,
      error: "book_not_found",
    });

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe(E_BOOK_NOT_FOUND);
  });

  it("returns 500 when database lookup fails", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: false,
      error: "database_error",
    });

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(E_DATABASE_ERROR);
  });

  it("returns 400 when no book version exists", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: true,
      data: {
        id: BOOK_ID,
        title: "My Book",
        author_id: "author-1",
        status: "DRAFT",
        original_language: "en",
        cover_image: "https://cdn.example.com/cover.jpg",
      },
    });
    // Supabase returns null for all version lookups
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "book_versions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                })),
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table in test: ${table}`);
      }),
    };
    mocks.createClient.mockResolvedValue(supabase);

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_NO_BOOK_VERSION_TO_PUBLISH);
  });

  it("returns 400 when book has no chapters", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: true,
      data: {
        id: BOOK_ID,
        title: "My Book",
        author_id: "author-1",
        status: "DRAFT",
        original_language: "en",
        cover_image: "https://cdn.example.com/cover.jpg",
      },
    });
    buildSupabaseMock({ chapters: [] });

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_NO_CHAPTERS);
  });

  it("returns 400 when chapters have no content", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: true,
      data: {
        id: BOOK_ID,
        title: "My Book",
        author_id: "author-1",
        status: "DRAFT",
        original_language: "en",
        cover_image: "https://cdn.example.com/cover.jpg",
      },
    });
    buildSupabaseMock({
      chapters: [{ id: "ch-1", content: null }],
    });

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_CHAPTER_NEEDS_CONTENT);
  });

  it("returns 400 when book title is missing", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: true,
      data: {
        id: BOOK_ID,
        title: "",
        author_id: "author-1",
        status: "DRAFT",
        original_language: "en",
        cover_image: "https://cdn.example.com/cover.jpg",
      },
    });
    buildSupabaseMock();

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_MISSING_BOOK_TITLE);
  });

  it("returns 400 when cover image is missing", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: true,
      data: {
        id: BOOK_ID,
        title: "My Book",
        author_id: "author-1",
        status: "DRAFT",
        original_language: "en",
        cover_image: null,
      },
    });
    buildSupabaseMock();

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_MISSING_COVER_IMAGE);
  });

  it("returns 400 when author display name is missing", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: true,
      data: {
        id: BOOK_ID,
        title: "My Book",
        author_id: "author-1",
        status: "DRAFT",
        original_language: "en",
        cover_image: "https://cdn.example.com/cover.jpg",
      },
    });
    buildSupabaseMock({
      authorProfile: { display_name: null, username: null },
    });

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_AUTHOR_DISPLAY_NAME_REQUIRED);
  });

  it("treats whitespace-only display name as missing", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: true,
      data: {
        id: BOOK_ID,
        title: "My Book",
        author_id: "author-1",
        status: "DRAFT",
        original_language: "en",
        cover_image: "https://cdn.example.com/cover.jpg",
      },
    });
    buildSupabaseMock({
      authorProfile: { display_name: "   ", username: "" },
    });

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_AUTHOR_DISPLAY_NAME_REQUIRED);
  });

  it("accepts username as fallback when display_name is missing", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: true,
      data: {
        id: BOOK_ID,
        title: "My Book",
        author_id: "author-1",
        status: "DRAFT",
        original_language: "en",
        cover_image: "https://cdn.example.com/cover.jpg",
      },
    });
    buildSupabaseMock({
      authorProfile: { display_name: null, username: "my-handle" },
    });

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("does not require display name when unpublishing", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: true,
      data: {
        id: BOOK_ID,
        title: "My Book",
        author_id: "author-1",
        status: "PUBLISHED",
        original_language: "en",
        cover_image: "https://cdn.example.com/cover.jpg",
      },
    });
    buildSupabaseMock({
      version: {
        id: VERSION_ID,
        book_id: BOOK_ID,
        published_at: "2026-01-01T00:00:00.000Z",
        visibility: "public",
        published_chapter_count: null,
      },
      authorProfile: { display_name: null, username: null },
    });

    const res = await POST(makeRequest({ action: "unpublish" }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 200 for successful publish", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: true,
      data: {
        id: BOOK_ID,
        title: "My Book",
        author_id: "author-1",
        status: "DRAFT",
        original_language: "en",
        cover_image: "https://cdn.example.com/cover.jpg",
      },
    });
    buildSupabaseMock();

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 200 with alreadyPublished for re-publish", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: true,
      data: {
        id: BOOK_ID,
        title: "My Book",
        author_id: "author-1",
        status: "PUBLISHED",
        original_language: "en",
        cover_image: "https://cdn.example.com/cover.jpg",
      },
    });
    buildSupabaseMock({
      version: {
        id: VERSION_ID,
        book_id: BOOK_ID,
        published_at: "2026-01-01T00:00:00.000Z",
        visibility: "public",
        published_chapter_count: null,
      },
    });

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyPublished).toBe(true);
  });

  it("passes ownership check with correct userId", async () => {
    mocks.getBookAsOwner.mockResolvedValue({
      ok: true,
      data: {
        id: BOOK_ID,
        title: "My Book",
        author_id: "author-1",
        status: "DRAFT",
        original_language: "en",
        cover_image: "https://cdn.example.com/cover.jpg",
      },
    });
    buildSupabaseMock();

    await POST(makeRequest({}), makeParams());

    expect(mocks.getBookAsOwner).toHaveBeenCalledWith(
      expect.anything(),
      BOOK_ID,
      "author-1",
      expect.any(String),
    );
  });
  function publishableBook() {
    mocks.getBookAsOwner.mockResolvedValue({ ok: true, data: { id: BOOK_ID, title: "My Book", author_id: "author-1", status: "DRAFT", original_language: "en", cover_image: "cover.jpg" } });
  }
  const draftVersion = () => ({ id: VERSION_ID, book_id: BOOK_ID, published_at: null as string | null, visibility: "private", published_chapter_count: null as number | null, status: "draft", updated_at: "2026-09-16T10:00:00.123456Z" });

  it("blocks publishing an edition currently being translated", async () => {
    publishableBook();
    const db = buildSupabaseMock({ version: { ...draftVersion(), status: "translating" } });
    const res = await POST(makeRequest({ scope: "book" }), makeParams());
    expect(res.status).toBe(409);
    expect(db.versionUpdates).toEqual([]);
  });

  it.each(["book", "chapter"])("atomically rejects %s publish when a worker claims the edition after reading", async (scope) => {
    publishableBook();
    const version = draftVersion();
    const db = buildSupabaseMock({ version, beforeVersionUpdate: () => { version.status = "translating"; version.updated_at = "new-claim"; } });
    const res = await POST(makeRequest({ scope, chapterId: "ch-1" }), makeParams());
    expect(res.status).toBe(409);
    expect(version.published_at).toBeNull();
    expect(db.versionUpdates).toEqual([]);
  });

  it("rejects publishing a later chapter before the first chapter", async () => {
    publishableBook();
    const db = buildSupabaseMock({ chapters: [{ id: "ch-1", content: "First" }, { id: "ch-2", content: "Second" }] });
    const res = await POST(makeRequest({ scope: "chapter", chapterId: "ch-2" }), makeParams());
    expect(res.status).toBe(409);
    expect(db.versionUpdates).toEqual([]);
  });

  it("allows only the next chapter in a partially released edition", async () => {
    publishableBook();
    const version = { ...draftVersion(), published_at: "2026-09-15T10:00:00Z", published_chapter_count: 1 };
    const db = buildSupabaseMock({ version, chapters: [{ id: "ch-1", content: "First" }, { id: "ch-2", content: "Second" }] });
    const res = await POST(makeRequest({ scope: "chapter", chapterId: "ch-2" }), makeParams());
    expect(res.status).toBe(200);
    expect(db.versionUpdates[0]?.published_chapter_count).toBe(2);
  });

  it.each([undefined, "bok", "BOOK", null])("does not expand a partial release without exact explicit book scope (%s)", async (scope) => {
    publishableBook();
    const version = { ...draftVersion(), published_at: "2026-09-15T10:00:00Z", published_chapter_count: 1 };
    const db = buildSupabaseMock({ version, chapters: [{ id: "ch-1", content: "First" }, { id: "ch-2", content: "Second" }] });
    const res = await POST(makeRequest({ scope }), makeParams());
    expect(res.status).toBe(scope === undefined ? 200 : 400);
    if (scope === undefined) expect(await res.json()).toMatchObject({ alreadyPublished: true });
    expect(version.published_chapter_count).toBe(1);
    expect(db.versionUpdates).toEqual([]);
  });

  it("preserves explicit all-chapters publishing for a partially released edition", async () => {
    publishableBook();
    const version = { ...draftVersion(), published_at: "2026-09-15T10:00:00Z", published_chapter_count: 1 };
    const db = buildSupabaseMock({ version, chapters: [{ id: "ch-1", content: "First" }, { id: "ch-2", content: "Second" }] });
    const res = await POST(makeRequest({ scope: "book" }), makeParams());
    expect(res.status).toBe(200);
    expect(db.versionUpdates[0]?.published_chapter_count).toBeNull();
  });

  it.each(["book", "chapter"])("correlates %s publication with its imported edition", async (scope) => {
    mocks.getBookAsOwner.mockResolvedValue({ ok: true, data: {
      id: BOOK_ID, title: "My Book", author_id: "author-1", status: "DRAFT",
      original_language: "en", cover_image: "https://cdn.example.com/cover.jpg",
    } });
    buildSupabaseMock();
    const res = await POST(makeRequest(scope === "chapter" ? { scope, chapterId: "ch-1" } : {}), makeParams());
    expect(res.status).toBe(200);
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith(expect.anything(), {
      eventType: "first_publish", userId: "author-1", bookId: BOOK_ID,
      path: `/api/books/${BOOK_ID}/publish`,
      props: { scope, bookVersionId: VERSION_ID },
    });
  });

});
