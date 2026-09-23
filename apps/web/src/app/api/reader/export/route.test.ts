import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }) }));

describe("reading data export", () => {
  const filters: unknown[][] = [];
  const cursors: unknown[][] = [];
  beforeEach(() => {
    vi.clearAllMocks(); filters.length = 0; cursors.length = 0;
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

  it("exports only the session user's data, with pagination and no caching", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    const data = await response.json();
    expect(data.bookmarks).toHaveLength(500);
    expect(data.readingPreferences).toEqual({ settings: { theme: "dark" } });
    expect(data.scope).toBe("reading-data");
    expect(filters).toEqual([
      ["profiles", "user_id", "reader-1"],
      ["bookmarks", "user_id", "reader-1"],
      ["bookmarks", "user_id", "reader-1"],
      ["readings", "user_id", "reader-1"],
      ["listening_positions", "user_id", "reader-1"],
    ]);
    expect(cursors).toContainEqual(["bookmarks", "id", "499"]);
  });

  it("returns an error, never a partial download, if a query fails", async () => {
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "unavailable" } }) }) }) });
    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });
});
