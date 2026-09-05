import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  resolveAuthorBooks: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/author/stats-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/author/stats-scope")>();
  return { ...actual, resolveAuthorBooks: mocks.resolveAuthorBooks };
});

const { GET } = await import("./route");

const req = (period = "30d") =>
  new Request(`http://localhost/api/author/stats?period=${period}`);

/**
 * Chainable stub. Paged reads resolve through `.range`; the published-book
 * count is a head query that resolves on `.eq`, so both shapes are thenable.
 */
function adminStub(opts: {
  rowsByTable?: Record<string, unknown[]>;
  publishedCount?: number;
  publishedError?: { message: string } | null;
  onFilter?: (table: string, col: string, val: unknown) => void;
}) {
  const { rowsByTable = {}, publishedCount = 0, publishedError = null, onFilter } = opts;
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["select", "in", "order", "not", "is", "gte", "lte"]) {
        builder[m] = chain;
      }
      builder.eq = (col: string, val: unknown) => {
        onFilter?.(table, col, val);
        return builder;
      };
      builder.range = (from: number) =>
        Promise.resolve({ data: from === 0 ? (rowsByTable[table] ?? []) : [], error: null });
      // A head/count query is awaited directly off the filter chain.
      (builder as { then?: unknown }).then = (
        resolve: (v: { count: number | null; error: unknown }) => unknown
      ) => resolve({ count: publishedError ? null : publishedCount, error: publishedError });
      return builder;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthorRoleForApi.mockResolvedValue({ user: { id: "author-1" }, response: undefined });
  mocks.createClient.mockResolvedValue({});
  mocks.resolveAuthorBooks.mockResolvedValue({ ok: true, bookIds: ["book-1"], books: [] });
});

describe("GET /api/author/stats — publishedBooks", () => {
  it("returns the count, because the dashboard reads it off this response", async () => {
    mocks.createAdminClient.mockReturnValue(adminStub({ publishedCount: 3 }));

    const body = await (await GET(req())).json();

    // It used to be absent entirely, so the dashboard's `?? 0` made the figure
    // a permanent nought that looked like a real answer.
    expect(body).toHaveProperty("publishedBooks");
    expect(body.publishedBooks).toBe(3);
  });

  it("counts only PUBLISHED books, matching what a reader can find", async () => {
    const filters: Array<[string, string, unknown]> = [];
    mocks.createAdminClient.mockReturnValue(
      adminStub({ publishedCount: 1, onFilter: (t, c, v) => filters.push([t, c, v]) })
    );

    await GET(req());

    // The public routes filter on status = "PUBLISHED"; an author's count has
    // to agree with them or the dashboard contradicts the storefront.
    expect(filters).toContainEqual(["books", "status", "PUBLISHED"]);
    expect(filters).toContainEqual(["books", "author_id", "author-1"]);
  });

  it("reports zero rather than omitting the field when the count fails", async () => {
    mocks.createAdminClient.mockReturnValue(
      adminStub({ publishedError: { message: "boom" } })
    );

    const body = await (await GET(req())).json();

    expect(body.publishedBooks).toBe(0);
  });

  it("includes the field for an author with no books at all", async () => {
    mocks.resolveAuthorBooks.mockResolvedValue({ ok: true, bookIds: [], books: [] });
    mocks.createAdminClient.mockReturnValue(adminStub({}));

    const body = await (await GET(req())).json();

    expect(body.publishedBooks).toBe(0);
    expect(body.views).toBe(0);
  });
});
