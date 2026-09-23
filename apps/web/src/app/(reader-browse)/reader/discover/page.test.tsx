import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getDiscoveryEnabled: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/lib/flags", () => ({
  getDiscoveryEnabled: mocks.getDiscoveryEnabled,
}));

vi.mock("@/lib/authors/public-author", () => ({
  getPublicAuthorInfoMap: async () => new Map(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/features/reader/reader-discover/ReaderDiscoverPageView", () => ({
  default: vi.fn(() => null),
}));

const { default: ReaderDiscoverPage } = await import("./page");

describe("ReaderDiscoverPage discovery flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns notFound without querying data when discovery is disabled", async () => {
    mocks.getDiscoveryEnabled.mockReturnValue(false);

    await expect(
      ReaderDiscoverPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

const controlledBooks = [
  { id: "dual", title: "Sea story", cover_image: null, author_id: "author", audiobook_status: "published", language: "en", status: "PUBLISHED", published_at: "2026-09-20", is_featured: false },
  { id: "ebook", title: "Another story", cover_image: null, author_id: "author", audiobook_status: null, language: "en", status: "PUBLISHED", published_at: "2026-09-19", is_featured: true },
  { id: "sv", title: "Sea story SV", cover_image: null, author_id: "author", audiobook_status: "published", language: "sv", status: "PUBLISHED" },
  { id: "draft", title: "Sea story draft", cover_image: null, author_id: "author", audiobook_status: "published", language: "en", status: "DRAFT" },
  { id: "literal", title: "100%_true\\path", cover_image: null, author_id: "author", language: "en", status: "PUBLISHED" },
];

function catalog(failingTable?: string, books = controlledBooks) {
  const genres = [{ id: "fiction", slug: "fiction", name_en: "Fiction" }, { id: "romance", slug: "romance", name_en: "Romance" }];
  const junctions = [
    { book_id: "dual", genre_id: "fiction" }, { book_id: "dual", genre_id: "romance" },
    { book_id: "sv", genre_id: "fiction" }, { book_id: "draft", genre_id: "fiction" },
    { book_id: "ebook", genre_id: "romance" },
  ];
  return {
    from(table: string) {
      let rows: Record<string, unknown>[] = table === "books" ? [...books] : table === "genres" ? [...genres] : table === "book_genres" ? [...junctions] : [];
      const orders: Array<{ key: string; ascending: boolean }> = [];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return query; },
        in: (key: string, values: string[]) => {
          rows = key === "book_genres.genres.slug"
            ? rows.filter((r) => junctions.some((j) => j.book_id === r.id && values.includes(j.genre_id)))
            : rows.filter((r) => values.includes(r[key] as string));
          return query;
        },
        ilike: (key: string, pattern: string) => {
          // SQL LIKE semantics, including escaped %, _ and backslash.
          let regex = "";
          for (let i = 0; i < pattern.length; i++) {
            const char = pattern[i];
            if (char === "\\" && i + 1 < pattern.length) regex += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            else if (char === "%") regex += ".*";
            else if (char === "_") regex += ".";
            else regex += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          }
          rows = rows.filter((r) => new RegExp(`^${regex}$`, "i").test(String(r[key])));
          return query;
        },
        order: (key: string, options: { ascending: boolean }) => { orders.push({ key, ...options }); return query; },
        limit: (count: number) => {
          rows.sort((a, b) => {
            for (const { key, ascending } of orders) {
              const cmp = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
              if (cmp) return ascending ? cmp : -cmp;
            }
            return 0;
          });
          rows = rows.slice(0, count); return query;
        },
        or: () => { rows = rows.filter((r) => r.language === "en" || r.language == null); return query; },
        then: (resolve: (value: unknown) => void) => resolve({ data: table === failingTable ? null : rows, error: table === failingTable ? { message: "database unavailable" } : null }),
      };
      return query;
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  };
}

describe("ReaderDiscoverPage catalog filters", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getDiscoveryEnabled.mockReturnValue(true); });

  it("keeps a published ebook discoverable when an audiobook is also available", async () => {
    mocks.createClient.mockResolvedValueOnce(catalog());
    const result = await ReaderDiscoverPage({ searchParams: Promise.resolve({ format: "ebook" }) });
    expect(result.props.children.props.books).toContainEqual(expect.objectContaining({ id: "dual", hasAudiobook: true }));
  });

  it.each(["books", "genres", "profiles"])("uses the retry boundary on %s query failure instead of claiming an empty catalog", async (table) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createClient.mockResolvedValueOnce(catalog(table));
    await expect(ReaderDiscoverPage({ searchParams: Promise.resolve({}) })).rejects.toThrow();
    log.mockRestore();
  });
});


describe("Discover URL input", () => {
  it("accepts repeated parameters without crashing and deduplicates genre selections", async () => {
    mocks.getDiscoveryEnabled.mockReturnValue(true);
    mocks.createClient.mockResolvedValueOnce(catalog());
    const result = await ReaderDiscoverPage({ searchParams: Promise.resolve({
      q: ["story", "ignored"], lang: ["sv", "en"], genre: ["fiction,romance", "fiction"],
      format: ["ebook", "audiobook"], sort: ["title", "newest"],
    }) });
    expect(result.props.children.props.activeFilters).toEqual({
      query: "story", language: "sv", genreSlugs: ["fiction", "romance"], format: "ebook", sort: "title",
    });
  });
});


describe("controlled discovery catalog", () => {
  beforeEach(() => { mocks.getDiscoveryEnabled.mockReturnValue(true); mocks.createClient.mockResolvedValue(catalog()); });
  it("combines title, language, genre union and audio filters without duplicates or drafts", async () => {
    const result = await ReaderDiscoverPage({ searchParams: Promise.resolve({ q: "story", lang: "en", genre: "fiction,romance", format: "audiobook", sort: "title" }) });
    expect(result.props.children.props.books.map((b: { id: string }) => b.id)).toEqual(["dual"]);
  });
  it("uses title order and retains dual-format ebooks", async () => {
    const result = await ReaderDiscoverPage({ searchParams: Promise.resolve({ q: "story", format: "ebook", sort: "title" }) });
    expect(result.props.children.props.books.map((b: { id: string }) => b.id)).toEqual(["ebook", "dual"]);
  });
  it.each(["%_", "\\path"])("treats %s in a title as literal text", async (q) => {
    const result = await ReaderDiscoverPage({ searchParams: Promise.resolve({ q }) });
    expect(result.props.children.props.books.map((b: { id: string }) => b.id)).toEqual(["literal"]);
  });
  it("returns an honest empty catalog and can recover on the next load", async () => {
    mocks.createClient.mockResolvedValueOnce(catalog(undefined, []));
    const empty = await ReaderDiscoverPage({ searchParams: Promise.resolve({}) });
    expect(empty.props.children.props.resultCount).toBe(0);
    const recovered = await ReaderDiscoverPage({ searchParams: Promise.resolve({}) });
    expect(recovered.props.children.props.resultCount).toBe(3);
  });
  it("recovers after a failed catalog request", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createClient.mockResolvedValueOnce(catalog("books"));
    await expect(ReaderDiscoverPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("Could not load Discover");
    const recovered = await ReaderDiscoverPage({ searchParams: Promise.resolve({}) });
    expect(recovered.props.children.props.resultCount).toBe(3);
    log.mockRestore();
  });
});
