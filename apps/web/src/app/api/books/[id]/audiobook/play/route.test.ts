import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  E_AUDIOBOOK_FEATURE_DISABLED,
  E_AUDIO_PATH_INVALID,
  E_AUDIO_SIGN_FAILED,
  E_BOOK_NOT_FOUND,
  E_CHAPTER_NOT_PUBLISHED,
  E_FORBIDDEN,
} from "@/lib/api-errors";

/* ── mocks ─────────────────────────────────────────────────── */

const mockGetUser = vi.fn();
const { createClient, createAdminClient, canUserReadBook, requireAdminRole, logAnalyticsEvent } =
  vi.hoisted(() => ({
    createClient: vi.fn(),
    createAdminClient: vi.fn(),
    canUserReadBook: vi.fn(),
    requireAdminRole: vi.fn(),
    logAnalyticsEvent: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/books/access", () => ({ canUserReadBook }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminRole }));
vi.mock("@/lib/tts/storage", () => ({ getAudiobookStorageBucket: () => "audiobooks" }));
vi.mock("@/lib/analytics/events", () => ({ logAnalyticsEvent }));

/* ── helpers ───────────────────────────────────────────────── */

function fakeQuery(rows: Record<string, unknown>[] | Record<string, unknown> | null) {
  const single = Array.isArray(rows) ? rows[0] ?? null : rows;
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: single, error: null }),
  };
}

type ChainableQuery = ReturnType<typeof fakeQuery>;

/**
 * Session client. Carries `from` as well as `auth` because the route reads the
 * caller's saved listening position through it (WP-03) — with the session
 * client on purpose, so RLS is what scopes the row to its owner.
 */
function sessionClient(savedPosition?: Record<string, unknown> | null, error?: { code: string; message: string }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: error ? null : savedPosition ?? null,
      error: error ?? null,
    }),
  };
  return {
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table !== "listening_positions") throw new Error(`Unexpected session table ${table}`);
      return chain;
    }),
    __positionChain: chain,
  };
}

function adminWith(tables: Record<string, ChainableQuery>, storage?: { signedUrl?: string; error?: string }) {
  const createSignedUrl = vi.fn().mockResolvedValue(
      storage?.error
        ? { data: null, error: { message: storage.error } }
        : { data: { signedUrl: storage?.signedUrl ?? "https://signed" }, error: null }
    );
  const storageFrom = vi.fn().mockReturnValue({
    createSignedUrl,
  });
  return {
    from: vi.fn((table: string) => tables[table] ?? fakeQuery(null)),
    storage: { from: storageFrom },
    __createSignedUrl: createSignedUrl,
  };
}

const BOOK_ID = "00000000-0000-4000-8000-000000000001";
const CHAPTER_ID = "ch-1";
const AUTHOR_ID = "author-1";
const READER_ID = "reader-1";

const draftBook = { id: BOOK_ID, status: "DRAFT", author_id: AUTHOR_ID, price_amount: 0, pricing_model: "book_only" };
const publishedBook = { ...draftBook, status: "PUBLISHED" };

const chapter = { id: CHAPTER_ID, book_id: BOOK_ID, order: 0, book_version_id: "bv-1" };
const versionAllPublished = { published_at: "2025-01-01", published_chapter_count: null };
const versionPartial = { published_at: "2025-01-01", published_chapter_count: 0 }; // chapter 0 NOT published

const cache = { audio_path: "books/book-1/ch-1.wav", created_at: "2025-01-01" };

function makeRequest() {
  return new Request(`http://localhost/api/books/${BOOK_ID}/audiobook/play?chapterId=${CHAPTER_ID}`);
}

function params() {
  return { params: Promise.resolve({ id: BOOK_ID }) };
}

/* ── env ───────────────────────────────────────────────────── */

const savedEnv = { ...process.env };

describe("GET /api/books/[id]/audiobook/play", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "true";
    process.env.AUDIOBOOK_ENABLED = "true";

    createClient.mockResolvedValue(sessionClient());
    // Default: caller is not an admin. Admin-specific tests override this.
    requireAdminRole.mockResolvedValue({ ok: false });
    logAnalyticsEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("returns 503 when feature flag is off", async () => {
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "false";
    process.env.AUDIOBOOK_ENABLED = "false";

    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());

    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(E_AUDIOBOOK_FEATURE_DISABLED);
  });

  it("author can preview audio on a DRAFT book", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: AUTHOR_ID } } });
    const admin = adminWith({
        chapters: fakeQuery(chapter),
        books: fakeQuery(draftBook),
        book_versions: fakeQuery(versionAllPublished),
        chapter_audio_cache: fakeQuery(cache),
      });
    createAdminClient.mockReturnValue(admin);

    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.audioUrl).toBe("https://signed");
    expect(admin.storage.from).toHaveBeenCalledWith("audiobooks");
    expect(admin.__createSignedUrl).toHaveBeenCalledWith("books/book-1/ch-1.wav", 60 * 15);
  });

  it("admin moderator can preview audio on a DRAFT book they don't own", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    requireAdminRole.mockResolvedValue({ ok: true });
    canUserReadBook.mockResolvedValue(false);
    const admin = adminWith({
      chapters: fakeQuery(chapter),
      books: fakeQuery(draftBook),
      book_versions: fakeQuery(versionAllPublished),
      chapter_audio_cache: fakeQuery(cache),
    });
    createAdminClient.mockReturnValue(admin);

    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.audioUrl).toBe("https://signed");
  });

  it("anonymous reader gets 404 on DRAFT book", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    createAdminClient.mockReturnValue(
      adminWith({
        chapters: fakeQuery(chapter),
        books: fakeQuery(draftBook),
      })
    );

    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe(E_BOOK_NOT_FOUND);
  });

  it("reader with purchase access gets audio on published book", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: READER_ID } } });
    canUserReadBook.mockResolvedValue(true);
    createAdminClient.mockReturnValue(
      adminWith({
        chapters: fakeQuery(chapter),
        books: fakeQuery(publishedBook),
        book_versions: fakeQuery(versionAllPublished),
        chapter_audio_cache: fakeQuery(cache),
      })
    );

    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.audioUrl).toBe("https://signed");
  });

  it("reader without purchase access gets 403", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: READER_ID } } });
    canUserReadBook.mockResolvedValue(false);
    createAdminClient.mockReturnValue(
      adminWith({
        chapters: fakeQuery(chapter),
        books: fakeQuery(publishedBook),
      })
    );

    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(E_FORBIDDEN);
  });

  it("reader blocked from unpublished chapter even with purchase access", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: READER_ID } } });
    canUserReadBook.mockResolvedValue(true);
    createAdminClient.mockReturnValue(
      adminWith({
        chapters: fakeQuery(chapter), // chapter.order = 0
        books: fakeQuery(publishedBook),
        book_versions: fakeQuery(versionPartial), // published_chapter_count = 0
      })
    );

    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(E_CHAPTER_NOT_PUBLISHED);
  });

  it("returns AUDIO_SIGN_FAILED when storage signing fails", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: AUTHOR_ID } } });
    createAdminClient.mockReturnValue(
      adminWith(
        {
          chapters: fakeQuery(chapter),
          books: fakeQuery(draftBook),
          book_versions: fakeQuery(versionAllPublished),
          chapter_audio_cache: fakeQuery(cache),
        },
        { error: "StorageApiError: Object not found" }
      )
    );

    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(E_AUDIO_SIGN_FAILED);
  });

  it("rejects legacy http URLs in chapter_audio_cache.audio_path", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: AUTHOR_ID } } });
    createAdminClient.mockReturnValue(
      adminWith({
        chapters: fakeQuery(chapter),
        books: fakeQuery(draftBook),
        book_versions: fakeQuery(versionAllPublished),
        chapter_audio_cache: fakeQuery({
          audio_path: "https://public.example.com/book-1/ch-1.wav",
          created_at: "2025-01-01",
        }),
      })
    );

    const { GET } = await import("./route");
    const res = await GET(makeRequest(), params());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(E_AUDIO_PATH_INVALID);
  });

  /* ── WP-03: server-side listen chokepoint + resume position ─────────────── */

  describe("listening instrumentation", () => {
    function grantedAdmin() {
      return adminWith({
        chapters: fakeQuery(chapter),
        books: fakeQuery(publishedBook),
        book_versions: fakeQuery(versionAllPublished),
        chapter_audio_cache: fakeQuery(cache),
      });
    }

    it("emits audio_requested with the admin client when a signed URL is issued", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: READER_ID } } });
      canUserReadBook.mockResolvedValue(true);
      const admin = grantedAdmin();
      createAdminClient.mockReturnValue(admin);

      const res = await (await import("./route")).GET(makeRequest(), params());

      expect(res.status).toBe(200);
      expect(logAnalyticsEvent).toHaveBeenCalledTimes(1);
      const [client, payload] = logAnalyticsEvent.mock.calls[0];
      // Service role, not the caller session: analytics_events has no SELECT
      // policy and an INSERT policy keyed on auth.uid().
      expect(client).toBe(admin);
      expect(payload).toMatchObject({
        eventType: "audio_requested",
        userId: READER_ID,
        bookId: BOOK_ID,
        props: {
          chapterId: CHAPTER_ID,
          chapterOrder: 0,
          signedIn: true,
          isAuthorPreview: false,
          isModeratorAdmin: false,
        },
      });
    });

    it("counts anonymous listeners, who have no client-side events at all", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      canUserReadBook.mockResolvedValue(true);
      createAdminClient.mockReturnValue(grantedAdmin());

      const res = await (await import("./route")).GET(makeRequest(), params());

      expect(res.status).toBe(200);
      expect(logAnalyticsEvent.mock.calls[0][1]).toMatchObject({
        eventType: "audio_requested",
        userId: null,
        props: expect.objectContaining({ signedIn: false }),
      });
    });

    it("emits nothing when the chapter has no rendered audio", async () => {
      // Nothing was made available, so there is nothing to count.
      mockGetUser.mockResolvedValue({ data: { user: { id: READER_ID } } });
      canUserReadBook.mockResolvedValue(true);
      createAdminClient.mockReturnValue(
        adminWith({
          chapters: fakeQuery(chapter),
          books: fakeQuery(publishedBook),
          book_versions: fakeQuery(versionAllPublished),
          chapter_audio_cache: fakeQuery(null),
        })
      );

      const res = await (await import("./route")).GET(makeRequest(), params());

      expect(res.status).toBe(200);
      expect((await res.json()).audioUrl).toBeNull();
      expect(logAnalyticsEvent).not.toHaveBeenCalled();
    });

    it("emits nothing when access is denied", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: READER_ID } } });
      canUserReadBook.mockResolvedValue(false);
      createAdminClient.mockReturnValue(adminWith({ chapters: fakeQuery(chapter), books: fakeQuery(publishedBook) }));

      const res = await (await import("./route")).GET(makeRequest(), params());

      expect(res.status).toBe(403);
      expect(logAnalyticsEvent).not.toHaveBeenCalled();
    });

    it("returns the reader's saved position alongside the signed URL", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: READER_ID } } });
      canUserReadBook.mockResolvedValue(true);
      const session = sessionClient({ position_seconds: 312.5, duration_seconds: 900 });
      createClient.mockResolvedValue(session);
      createAdminClient.mockReturnValue(grantedAdmin());

      const res = await (await import("./route")).GET(makeRequest(), params());
      const body = await res.json();

      expect(body).toMatchObject({ audioUrl: "https://signed", resumePositionSeconds: 312.5 });
      expect(session.__positionChain.eq).toHaveBeenCalledWith("user_id", READER_ID);
      expect(session.__positionChain.eq).toHaveBeenCalledWith("chapter_id", CHAPTER_ID);
    });

    it("does not resume a chapter that was played to the end", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: READER_ID } } });
      canUserReadBook.mockResolvedValue(true);
      createClient.mockResolvedValue(sessionClient({ position_seconds: 898, duration_seconds: 900 }));
      createAdminClient.mockReturnValue(grantedAdmin());

      const res = await (await import("./route")).GET(makeRequest(), params());

      expect((await res.json()).resumePositionSeconds).toBeNull();
    });

    it("skips the position lookup entirely for anonymous callers", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      canUserReadBook.mockResolvedValue(true);
      const session = sessionClient();
      createClient.mockResolvedValue(session);
      createAdminClient.mockReturnValue(grantedAdmin());

      const res = await (await import("./route")).GET(makeRequest(), params());

      expect((await res.json()).resumePositionSeconds).toBeNull();
      expect(session.from).not.toHaveBeenCalled();
    });

    it("still serves audio when the position table is missing", async () => {
      // The migration may not be applied yet. A missing resume point must never
      // turn into a failed audio load.
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      mockGetUser.mockResolvedValue({ data: { user: { id: READER_ID } } });
      canUserReadBook.mockResolvedValue(true);
      createClient.mockResolvedValue(
        sessionClient(null, { code: "PGRST205", message: "Could not find the table" })
      );
      createAdminClient.mockReturnValue(grantedAdmin());

      const res = await (await import("./route")).GET(makeRequest(), params());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.audioUrl).toBe("https://signed");
      expect(body.resumePositionSeconds).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        "[audiobook play] resume position lookup failed",
        expect.objectContaining({ code: "PGRST205" })
      );
      warn.mockRestore();
    });

    it("still serves audio when the position lookup throws outright", async () => {
      // Runs inside a Promise.all with the analytics emit; an unhandled rejection
      // here would take the whole audio load down with it.
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      mockGetUser.mockResolvedValue({ data: { user: { id: READER_ID } } });
      canUserReadBook.mockResolvedValue(true);
      createClient.mockResolvedValue({
        auth: { getUser: mockGetUser },
        from: vi.fn(() => {
          throw new Error("connection reset");
        }),
      });
      createAdminClient.mockReturnValue(grantedAdmin());

      const res = await (await import("./route")).GET(makeRequest(), params());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.audioUrl).toBe("https://signed");
      expect(body.resumePositionSeconds).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        "[audiobook play] resume position lookup threw",
        expect.objectContaining({ message: "connection reset" })
      );
      warn.mockRestore();
    });
  });
});
