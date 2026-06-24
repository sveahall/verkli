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
const { createClient, createAdminClient, canUserReadBook, requireAdminRole } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  canUserReadBook: vi.fn(),
  requireAdminRole: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/books/access", () => ({ canUserReadBook }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminRole }));
vi.mock("@/lib/tts/storage", () => ({ getAudiobookStorageBucket: () => "audiobooks" }));

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

    createClient.mockResolvedValue({ auth: { getUser: mockGetUser } });
    // Default: caller is not an admin. Admin-specific tests override this.
    requireAdminRole.mockResolvedValue({ ok: false });
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
});
