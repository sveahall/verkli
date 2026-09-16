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

function catalog(failingTable?: string) {
  const dualFormatBook = { id: "dual", title: "Both formats", cover_image: null, author_id: "author", audiobook_status: "published", language: "en", status: "PUBLISHED" };
  return {
    from(table: string) {
      let rows: Record<string, unknown>[] = table === "books" ? [dualFormatBook] : [];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return query; },
        in: () => query,
        order: () => query,
        limit: () => query,
        or: (condition: string) => {
          if (condition.startsWith("audiobook_status")) rows = rows.filter((r) => !r.audiobook_status || r.audiobook_status === "not_started");
          return query;
        },
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
    expect(result.props.children.props.books).toEqual([expect.objectContaining({ id: "dual", hasAudiobook: true })]);
  });

  it.each(["books", "genres", "profiles"])("uses the retry boundary on %s query failure instead of claiming an empty catalog", async (table) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createClient.mockResolvedValueOnce(catalog(table));
    await expect(ReaderDiscoverPage({ searchParams: Promise.resolve({}) })).rejects.toThrow();
    log.mockRestore();
  });
});
