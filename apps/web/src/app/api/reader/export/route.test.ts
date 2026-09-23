import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }) }));

describe("reading data export", () => {
  const filters: unknown[][] = [];
  const cursors: unknown[][] = [];
  beforeEach(() => {
    vi.clearAllMocks(); filters.length = 0; cursors.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getUser.mockResolvedValue({ data: { user: { id: "reader-1", email: "reader@example.com" } }, error: null });
    let bookmarkPages = 0;
    mocks.from.mockImplementation((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((...args: unknown[]) => { filters.push([table, ...args]); return query; }),
        gt: vi.fn((...args: unknown[]) => { cursors.push([table, ...args]); return query; }),
        order: vi.fn(() => query),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: { preferences: { reader: { settings: { theme: "dark" } } } }, error: null }),
      };
      if (table === "bookmarks" && bookmarkPages++ === 0) {
        query.limit.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ id: String(i), book_id: `book-${i}` })), error: null });
      }
      return query;
    });
  });

  it("requires login before querying personal data", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("refuses an auth error even if a user object is present", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "reader-1" } }, error: { message: "Expired session" } });
    expect((await GET()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("exports explicit empty lists when no reading activity exists", async () => {
    const original = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table: string) => {
      const query = original(table);
      query.limit.mockReset().mockResolvedValue({ data: [], error: null });
      query.maybeSingle.mockResolvedValue({ data: null, error: null });
      return query;
    });
    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({ readingPreferences: {}, bookmarks: [], readingProgress: [], listeningProgress: [] }));
  });

  it("exports only the session user's data, with pagination and no caching", async () => {
    const response = await Reflect.apply(GET, null, [new Request("https://example.invalid/api/reader/export?userId=someone-else")]);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    const data = await response.json();
    expect(data.bookmarks).toHaveLength(500);
    expect(data.readingPreferences).toEqual({ settings: { theme: "dark" } });
    expect(data.scope).toBe("reading-data");
    expect(data.coverage).toEqual(expect.objectContaining({ maxRowsPerList: 10000, truncated: false }));
    expect(filters).toEqual([
      ["profiles", "user_id", "reader-1"],
      ["bookmarks", "user_id", "reader-1"],
      ["bookmarks", "user_id", "reader-1"],
      ["readings", "user_id", "reader-1"],
      ["listening_positions", "user_id", "reader-1"],
    ]);
    expect(cursors).toContainEqual(["bookmarks", "id", "499"]);
  });

  it("rejects exports over 10,000 entries per list without returning a partial file", async () => {
    const original = mocks.from.getMockImplementation()!;
    let pageNumber = 0;
    mocks.from.mockImplementation((table: string) => {
      const query = original(table);
      if (table === "bookmarks") {
        const page = pageNumber++;
        query.limit.mockResolvedValue({ data: page < 21 ? Array.from({ length: 500 }, (_, i) => ({ id: String(page * 500 + i).padStart(8, "0") })) : [], error: null });
      }
      return query;
    });
    const response = await GET();
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual(expect.objectContaining({ error: "READING_EXPORT_TOO_LARGE", detail: expect.stringContaining("10,000") }));
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(pageNumber).toBeLessThanOrEqual(21);
  });

  it.each(["bookmarks", "readings", "listening_positions"])("never returns partial data when %s fails", async (failedTable) => {
    const original = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table: string) => {
      const query = original(table);
      if (table === failedTable) query.limit.mockReset().mockResolvedValue({ data: null, error: { message: "unavailable" } });
      return query;
    });
    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });

  it("returns an error, never a partial download, if a query fails", async () => {
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "unavailable" } }) }) }) });
    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });
});
