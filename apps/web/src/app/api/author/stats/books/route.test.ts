import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn(), admin: vi.fn(), books: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.session }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/author/stats-scope", async (original) => ({
  ...await original<typeof import("@/lib/author/stats-scope")>(), resolveAuthorBooks: mocks.books,
}));
const { GET } = await import("./route");
const request = () => new Request("http://localhost/api/author/stats/books?period=7d");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "author-1" } });
  mocks.session.mockResolvedValue({});
  mocks.books.mockResolvedValue({ ok: true, bookIds: ["book-1"], books: [{ id: "book-1", title: "A book" }] });
});
function database(failOrders: boolean, filters: unknown[][] = []) {
  return { from(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "in", "eq", "gte", "order"]) {
      builder[method] = (...args: unknown[]) => { filters.push([table, method, ...args]); return builder; };
    }
    builder.range = () => Promise.resolve({
      data: table === "orders" && !failOrders ? [{ book_id: "book-1" }] : [],
      error: table === "orders" && failOrders ? { message: "orders unavailable" } : null,
    });
    return builder;
  } };
}
describe("book purchase statistics", () => {
  it("fails visibly instead of returning confident zero purchases when orders fail", async () => {
    mocks.admin.mockReturnValue(database(true));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty("books");
  });
  it("preserves settled, period-filtered, owned-book purchase counts", async () => {
    const filters: unknown[][] = [];
    mocks.admin.mockReturnValue(database(false, filters));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).books[0].purchases).toBe(1);
    expect(filters).toContainEqual(["orders", "in", "book_id", ["book-1"]]);
    expect(filters).toContainEqual(["orders", "eq", "status", "paid"]);
    expect(filters.some(([table, method, field]) => table === "orders" && method === "gte" && field === "created_at")).toBe(true);
  });
});
