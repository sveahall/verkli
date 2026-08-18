import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryData } from "./page";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("./ReaderLibraryClient", () => ({
  default: vi.fn(() => null),
}));

const { default: ReaderLibraryPage } = await import("./page");

type Row = Record<string, unknown>;

/**
 * Minimal thenable stand-in for a PostgREST query builder: every filter method
 * returns the same chain, and awaiting it yields the configured rows.
 */
function makeChain(rows: Row[]) {
  const result = { data: rows, error: null };
  const chain: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
  };
  for (const method of ["select", "eq", "in", "order", "limit", "not"]) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  return chain;
}

function makeClient(tables: Record<string, Row[]>) {
  const seen: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      seen.push(table);
      return makeChain(tables[table] ?? []);
    }),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "reader-1" } } })),
    },
  };
  return { client, seen };
}

async function renderLibrary(options: {
  session: Record<string, Row[]>;
  admin: Record<string, Row[]>;
}): Promise<LibraryData> {
  const session = makeClient(options.session);
  const admin = makeClient(options.admin);
  mocks.createClient.mockResolvedValue(session.client);
  mocks.createAdminClient.mockReturnValue(admin.client);

  const element = (await ReaderLibraryPage()) as unknown as {
    props: { initialData: LibraryData };
  };
  return element.props.initialData;
}

describe("ReaderLibraryPage purchased shelf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a purchased book in the library after the author unpublishes it", async () => {
    // The buyer paid. Publication status is the author's shelf decision; it must
    // not silently repossess someone's purchase.
    const data = await renderLibrary({
      session: {
        readings: [],
        bookmarks: [],
        entitlements: [{ book_id: "book-unpublished", created_at: "2026-08-10T12:00:00Z" }],
      },
      admin: {
        books: [
          {
            id: "book-unpublished",
            title: "The Withdrawn Novel",
            cover_image: null,
            author_id: "author-1",
            status: "DRAFT",
          },
        ],
        profiles: [{ user_id: "author-1", display_name: "Johan Ek", username: null }],
        chapters: [{ id: "chapter-1", book_id: "book-unpublished", order: 0 }],
      },
    });

    expect(data.purchased).toHaveLength(1);
    expect(data.purchased[0]).toMatchObject({
      id: "book-unpublished",
      title: "The Withdrawn Novel",
      author: "Johan Ek",
    });
    expect(data.purchased[0].unavailableNote).toBeTruthy();
    // The public book page 404s for an unpublished book, so the shelf links
    // straight into the text the buyer still has access to.
    expect(data.purchased[0].href).toBe("/reader/read/chapter-1");
  });

  it("does not hand the buyer a dead link when no chapter can be resolved", async () => {
    const data = await renderLibrary({
      session: {
        readings: [],
        bookmarks: [],
        entitlements: [{ book_id: "book-unpublished", created_at: null }],
      },
      admin: {
        books: [
          {
            id: "book-unpublished",
            title: "The Withdrawn Novel",
            cover_image: null,
            author_id: "author-1",
            status: "DRAFT",
          },
        ],
        profiles: [],
        chapters: [],
      },
    });

    expect(data.purchased).toHaveLength(1);
    expect(data.purchased[0].href).toBeUndefined();
  });

  it("lists a purchased published book with a normal book link and a purchase date", async () => {
    const data = await renderLibrary({
      session: {
        readings: [],
        bookmarks: [],
        entitlements: [{ book_id: "book-1", created_at: "2026-08-10T12:00:00Z" }],
      },
      admin: {
        books: [
          {
            id: "book-1",
            title: "The Salt Road",
            cover_image: "cover.jpg",
            author_id: "author-1",
            status: "PUBLISHED",
          },
        ],
        profiles: [{ user_id: "author-1", display_name: "Johan Ek", username: null }],
      },
    });

    expect(data.purchased[0]).toMatchObject({
      id: "book-1",
      href: "/reader/books/book-1",
    });
    expect(data.purchased[0].lastOpenedLabel).toContain("Purchased");
    expect(data.purchased[0].unavailableNote).toBeNull();
  });

  it("resumes a purchased book at the reader's saved position", async () => {
    const data = await renderLibrary({
      session: {
        readings: [
          {
            book_id: "book-1",
            chapter_id: "chapter-7",
            progress_percent: 42,
            last_read_at: "2026-08-15T12:00:00Z",
          },
        ],
        bookmarks: [],
        entitlements: [{ book_id: "book-1", created_at: "2026-08-10T12:00:00Z" }],
        chapters: [{ id: "chapter-7", title: "The Crossing" }],
      },
      admin: {
        books: [
          {
            id: "book-1",
            title: "The Salt Road",
            cover_image: null,
            author_id: "author-1",
            status: "PUBLISHED",
          },
        ],
        profiles: [{ user_id: "author-1", display_name: "Johan Ek", username: null }],
      },
    });

    expect(data.purchased[0].href).toBe("/reader/read/chapter-7");
    expect(data.purchased[0].progress).toBe(42);
  });

  it("separates purchases from bookmarks so ownership is legible", async () => {
    // Previously both landed in `saved`, which made it impossible to tell what
    // you own from what you merely flagged.
    const data = await renderLibrary({
      session: {
        readings: [],
        bookmarks: [{ book_id: "book-bookmarked" }],
        entitlements: [{ book_id: "book-bought", created_at: "2026-08-10T12:00:00Z" }],
        books: [
          {
            id: "book-bookmarked",
            title: "Merely Flagged",
            cover_image: null,
            author_id: "author-2",
            status: "PUBLISHED",
          },
        ],
      },
      admin: {
        books: [
          {
            id: "book-bought",
            title: "Actually Owned",
            cover_image: null,
            author_id: "author-1",
            status: "PUBLISHED",
          },
        ],
        profiles: [
          { user_id: "author-1", display_name: "Johan Ek", username: null },
          { user_id: "author-2", display_name: "Ada Vik", username: null },
        ],
      },
    });

    expect(data.purchased.map((b) => b.id)).toEqual(["book-bought"]);
    expect(data.saved.map((b) => b.id)).toEqual(["book-bookmarked"]);
  });

  it("keeps the shelf in most-recent-purchase order", async () => {
    const data = await renderLibrary({
      session: {
        readings: [],
        bookmarks: [],
        entitlements: [
          { book_id: "book-new", created_at: "2026-08-16T12:00:00Z" },
          { book_id: "book-old", created_at: "2026-01-02T12:00:00Z" },
        ],
      },
      admin: {
        books: [
          {
            id: "book-old",
            title: "Older Purchase",
            cover_image: null,
            author_id: "author-1",
            status: "PUBLISHED",
          },
          {
            id: "book-new",
            title: "Newer Purchase",
            cover_image: null,
            author_id: "author-1",
            status: "PUBLISHED",
          },
        ],
        profiles: [{ user_id: "author-1", display_name: "Johan Ek", username: null }],
      },
    });

    expect(data.purchased.map((b) => b.id)).toEqual(["book-new", "book-old"]);
  });

  it("still hides an unpublished book the reader only bookmarked", async () => {
    // Publication governs browsing. Only entitlement overrides it.
    const data = await renderLibrary({
      session: {
        readings: [],
        bookmarks: [{ book_id: "book-draft" }],
        entitlements: [],
        // The session query filters on status, so an unpublished book simply
        // does not come back.
        books: [],
      },
      admin: {},
    });

    expect(data.saved).toHaveLength(0);
    expect(data.purchased).toHaveLength(0);
  });

  it("sends a signed-out visitor to sign-in with a next back to the library", async () => {
    const session = makeClient({});
    session.client.auth.getUser = vi.fn(async () => ({ data: { user: null } })) as never;
    mocks.createClient.mockResolvedValue(session.client);

    await expect(ReaderLibraryPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/reader/signin?next=/reader/library");
  });
});
