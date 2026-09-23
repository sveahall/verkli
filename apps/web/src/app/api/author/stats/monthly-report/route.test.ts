import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.session }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { GET } from "./route";
const request = (query = "month=2026-09") => new Request(`http://localhost/api/author/stats/monthly-report?${query}`);
const row = { id: "00001", book_id: "own", amount: 100, currency: "sek", status: "paid", created_at: "2026-09-01T00:00:00.000Z" };
const book = { id: "own", author_id: "author", created_at: "2026-08-01T00:00:00.000Z" };
type Row = Record<string, string | number>;
/** Executes PostgREST-like filters, unique ordering and the real 1000-row response cap. */
function database(rows: Row[], beforeRead?: (read: number, rows: Row[]) => string | void) {
  const filters: [string, string, unknown][] = [];
  const queries: { table: string; columns?: string; order?: string; filters: [string, string, unknown][] }[] = [];
  let reads = 0;
  return { filters, queries, from: vi.fn((table: string) => {
    const query: typeof queries[number] = { table, filters: [] };
    queries.push(query);
    let offset = 0; let count = 1000;
    const execute = async () => {
      const error = beforeRead?.(++reads, rows);
      if (error) return { data: null, error: { message: error } };
      const matched = rows.filter((r) => query.filters.every(([method, key, value]) => {
        const actual = r[key];
        if (method === "in") return (value as string[]).includes(String(actual));
        if (method === "eq") return actual === value;
        if (method === "gte") return String(actual) >= String(value);
        if (method === "gt") return String(actual) > String(value);
        return String(actual) < String(value);
      }));
      if (query.order) matched.sort((a, b) => String(a[query.order!]).localeCompare(String(b[query.order!])));
      return { data: matched.slice(offset, offset + Math.min(count, 1000)), error: null };
    };
    const builder = {
      select: (columns: string) => { query.columns = columns; return builder; },
      order: (column: string) => { query.order = column; return builder; },
      range: (from: number, to: number) => { offset = from; count = to - from + 1; return builder; },
      limit: (limit: number) => { count = limit; return builder; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => execute().then(resolve, reject),
    } as Record<string, unknown>;
    for (const method of ["in", "eq", "gte", "gt", "lt"]) builder[method] = (column: string, value: unknown) => {
      query.filters.push([method, column, value]); filters.push([method, column, value]); return builder;
    };
    return builder;
  }) };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
  mocks.auth.mockResolvedValue({ user: { id: "author" } });
  mocks.session.mockResolvedValue(database([book]));
});
afterEach(() => vi.useRealTimers());

describe("monthly report ownership and completeness", () => {
  it("rejects anonymous and reader requests before database access", async () => {
    for (const status of [401, 403]) {
      mocks.auth.mockResolvedValue({ response: new Response(null, { status }) });
      expect((await GET(request())).status).toBe(status);
    }
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("requires a valid month", async () => {
    for (const query of ["", "month=2026-13", "month=no"]) expect((await GET(request(query))).status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("scopes service-role rows to session-owned books and exclusive UTC month bounds", async () => {
    const session = database([book, { ...book, id: "other", author_id: "other-author" }]);
    mocks.session.mockResolvedValue(session);
    const db = database([row, { ...row, book_id: "other", amount: 99000 }, { ...row, created_at: "2026-10-01T00:00:00.000Z" }, { ...row, created_at: "2026-08-31T23:59:59.999Z" }]);
    mocks.admin.mockReturnValue(db);
    const response = await GET(request());
    expect((await response.json()).currencies[0].paidAmountMinor).toBe(100);
    expect(db.filters).toContainEqual(["in", "book_id", ["own"]]);
    expect(session.filters).toContainEqual(["eq", "author_id", "author"]);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(db.queries.every((q) => !q.columns?.includes("user_id"))).toBe(true);
  });
  it("never issues an unscoped query for authors without books", async () => {
    mocks.session.mockResolvedValue(database([]));
    expect((await (await GET(request())).json()).currencies).toEqual([]);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("paginates all orders in stable id order", async () => {
    const db = database(Array.from({ length: 1001 }, (_, i) => ({ ...row, id: String(i).padStart(5, "0") })));
    mocks.admin.mockReturnValue(db);
    expect((await (await GET(request())).json()).currencies[0].paidAmountMinor).toBe(100100);
    expect(db.queries.every((q) => q.order === "id")).toBe(true);
  });
  it("does not export a subtotal after a later order-page error", async () => {
    mocks.admin.mockReturnValue(database(Array.from({ length: 1001 }, (_, i) => ({ ...row, id: String(i).padStart(5, "0") })), (read) => read > 1 ? "page unavailable" : undefined));
    const result = await GET(request());
    expect(result.status).toBe(500);
    expect(await result.json()).not.toHaveProperty("currencies");
  });
  it("fails closed on ownership or malformed financial data", async () => {
    mocks.session.mockResolvedValueOnce(database([], () => "ownership unavailable"));
    expect((await GET(request())).status).toBe(500);
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.admin.mockReturnValue(database([{ ...row, amount: -1 }]));
    expect((await GET(request())).status).toBe(500);
  });
  it("includes an order on owned book 1001 and bounds every book filter", async () => {
    const books = Array.from({ length: 1001 }, (_, i) => ({ ...book, id: `book-${String(i).padStart(5, "0")}` }));
    mocks.session.mockResolvedValue(database(books));
    const db = database([{ ...row, book_id: books[1000].id }]); mocks.admin.mockReturnValue(db);
    expect((await (await GET(request())).json()).currencies[0]?.paidAmountMinor).toBe(100);
    expect(db.filters.filter(([method]) => method === "in").every(([, , ids]) => (ids as string[]).length <= 100)).toBe(true);
  });
  it("discards the entire scope when a later book page fails", async () => {
    mocks.session.mockResolvedValue(database(Array.from({ length: 1001 }, (_, i) => ({ ...book, id: String(i).padStart(5, "0") })), (read) => read > 1 ? "book page unavailable" : undefined));
    mocks.admin.mockReturnValue(database([]));
    expect((await GET(request())).status).toBe(500);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not duplicate a boundary order after an insert before the cursor", async () => {
    const orders = Array.from({ length: 1001 }, (_, i) => ({ ...row, id: String(i + 2).padStart(5, "0") }));
    const db = database(orders, (read, rows) => { if (read === 2) rows.push({ ...row, id: "00001", amount: 777, created_at: "2026-09-22T12:00:01.000Z" }); });
    mocks.admin.mockReturnValue(db);
    expect((await (await GET(request())).json()).currencies[0].paidAmountMinor).toBe(100100);
  });
  it("does not skip unread rows after deletion before the cursor", async () => {
    const orders = Array.from({ length: 1001 }, (_, i) => ({ ...row, id: String(i + 2).padStart(5, "0") }));
    mocks.admin.mockReturnValue(database(orders, (read, rows) => { if (read === 2) rows.shift(); }));
    const report = await (await GET(request())).json();
    expect(report.currencies[0].paidCount).toBe(1001);
    expect(report.limitations.join(" ")).toContain("not a transaction snapshot");
  });
  it("excludes new inserts beyond the cursor using a single read-start boundary", async () => {
    const orders = Array.from({ length: 1001 }, (_, i) => ({ ...row, id: String(i + 2).padStart(5, "0") }));
    mocks.admin.mockReturnValue(database(orders, (read, rows) => { if (read === 2) rows.push({ ...row, id: "99999", amount: 777, created_at: "2026-09-22T12:00:01.000Z" }); }));
    expect((await (await GET(request())).json()).currencies[0].paidAmountMinor).toBe(100100);
  });
});
