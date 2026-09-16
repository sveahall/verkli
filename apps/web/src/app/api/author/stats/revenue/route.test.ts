import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// Only ownership resolution is stubbed. fetchAllRows, the currency tallies and
// SETTLED_PAYMENT_STATUS stay real, so the paging and money maths under test are
// the ones that actually ship.
vi.mock("@/lib/author/stats-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/author/stats-scope")>();
  return { ...actual, resolveAuthorBooks: mocks.resolveAuthorBooks };
});

const { GET } = await import("./route");
const req = (query = "") => new Request(`http://localhost/api/author/stats/revenue${query}`);
afterEach(() => vi.useRealTimers());

/** Records every table touched, and answers each with one page of rows. */
function adminStub(rowsByTable: Record<string, unknown[]>, touched: string[]) {
  return {
    from(table: string) {
      touched.push(table);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "not", "is", "gte", "lte"]) {
        builder[method] = () => builder;
      }
      builder.range = (from: number) =>
        Promise.resolve({ data: from === 0 ? (rowsByTable[table] ?? []) : [], error: null });
      return builder;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthorRoleForApi.mockResolvedValue({
    user: { id: "author-1" },
    response: undefined,
  });
  mocks.createClient.mockResolvedValue({});
  mocks.resolveAuthorBooks.mockResolvedValue({ ok: true, bookIds: ["book-1"], books: [] });
});

describe("GET /api/author/stats/revenue", () => {
  it("never queries `donations` — the table has no author column to scope by", async () => {
    const touched: string[] = [];
    mocks.createAdminClient.mockReturnValue(
      adminStub({ orders: [{ amount: 15000, currency: "sek" }] }, touched)
    );

    await GET(req());

    // The old code filtered donations on `recipient_id`, a column that has
    // never existed in any migration. It errored on every request and the
    // author was shown a confident 0. Reintroducing the read is the regression
    // this guards: `donations` records a reader buying credits for THEMSELVES,
    // so there is nothing here to attribute to an author.
    expect(touched).not.toContain("donations");
    expect(touched).toContain("orders");
  });

  it("reports order revenue and a zero donation line", async () => {
    mocks.createAdminClient.mockReturnValue(
      adminStub({ orders: [{ amount: 15000, currency: "sek" }] }, [])
    );

    const body = await (await GET(req())).json();

    expect(body.orderRevenue).toBe(150);
    expect(body.donationRevenue).toBe(0);
    expect(body.currency).toBe("SEK");
  });

  it("keeps the donation line at zero even when orders are empty", async () => {
    mocks.createAdminClient.mockReturnValue(adminStub({ orders: [] }, []));

    const body = await (await GET(req())).json();

    expect(body.orderRevenue).toBe(0);
    expect(body.donationRevenue).toBe(0);
  });

  it("marks the answer partial when a revenue read fails", async () => {
    // Same failure shape as the stats route: a 200 full of zeros is a claim
    // about an author's earnings, not an absence of data.
    const failing = {
      from() {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "order", "not", "is", "gte", "lte"]) {
          b[m] = () => b;
        }
        b.range = () => Promise.resolve({ data: null, error: { message: "boom" } });
        return b;
      },
    };
    mocks.createAdminClient.mockReturnValue(failing);

    const body = await (await GET(req())).json();

    expect(body.partial).toBe(true);
  });

  it("does not mark a healthy answer partial", async () => {
    mocks.createAdminClient.mockReturnValue(
      adminStub({ orders: [{ amount: 15000, currency: "sek" }] }, [])
    );

    const body = await (await GET(req())).json();

    expect(body.partial).toBe(false);
  });

  it("totals several paid orders rather than reporting only the first", async () => {
    mocks.createAdminClient.mockReturnValue(
      adminStub(
        {
          orders: [
            { amount: 15000, currency: "sek" },
            { amount: 4900, currency: "sek" },
            { amount: 100, currency: "sek" },
          ],
        },
        []
      )
    );

    const body = await (await GET(req())).json();

    expect(body.orderRevenue).toBe(200);
    expect(body.totalRevenue).toBe(200);
  });
});


describe("revenue period and monetary boundaries", () => {
  type Row = Record<string, unknown>;
  function database(rows: Record<string, Row[]>, failAfterFirstPage = false) {
    const filters: Array<[string, string, string, unknown]> = [];
    return {
      filters,
      from(table: string) {
        const local: Array<[string, string, unknown]> = [];
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.order = () => builder;
        for (const method of ["in", "eq", "gte", "lte"]) {
          builder[method] = (column: string, value: unknown) => {
            filters.push([table, method, column, value]);
            local.push([method, column, value]);
            return builder;
          };
        }
        builder.range = (from: number, to: number) => {
          if (failAfterFirstPage && table === "orders" && from > 0) {
            return Promise.resolve({ data: null, error: { message: "page two unavailable" } });
          }
          const data = (rows[table] ?? []).filter((row) => local.every(([method, column, value]) => {
            if (method === "eq") return row[column] === value;
            if (method === "in") return (value as unknown[]).includes(row[column]);
            if (method === "gte") return String(row[column]) >= String(value);
            return String(row[column]) <= String(value);
          }));
          return Promise.resolve({ data: data.slice(from, to + 1), error: null });
        };
        return builder;
      },
    };
  }
  const order = (amount: number, created_at: string, currency = "sek", book_id = "book-1") => ({
    id: `order-${amount}`, amount, currency, book_id, created_at, status: "paid",
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
  });

  it.each([["?period=7d", 10], ["?period=30d", 30], ["?period=all", 60], ["", 30], ["?period=invalid", 30]])(
    "filters settled owned orders for %s", async (query, expected) => {
      const db = database({ orders: [
        order(1000, "2026-09-15T12:00:00Z"),
        order(2000, "2026-08-20T12:00:00Z"),
        order(3000, "2026-07-01T12:00:00Z"),
        { ...order(50000, "2026-09-15T12:00:00Z"), status: "pending" },
        order(60000, "2026-09-15T12:00:00Z", "sek", "someone-elses-book"),
      ] });
      mocks.createAdminClient.mockReturnValue(db);
      const body = await (await GET(req(query))).json();
      expect(body.totalRevenue).toBe(expected);
      expect(body.period).toBe(query.includes("7d") ? "7d" : query.includes("all") ? "all" : "30d");
      expect(body.dateBasis).toBe("order_created_at");
    }
  );

  it("never adds current subscription MRR to sales for the selected period", async () => {
    mocks.createAdminClient.mockReturnValue(database({
      orders: [order(15000, "2026-09-15T12:00:00Z")],
      author_subscriptions: [{ amount_monthly: 9900, currency: "sek", author_id: "author-1", status: "active" }],
    }));
    const body = await (await GET(req("?period=7d"))).json();
    expect(body.totalRevenue).toBe(150);
    expect(body.byCurrency).toEqual({ SEK: 150 });
    expect(body.subscriptionMRR).toBe(99);
    expect(body.subscriptionByCurrency).toEqual({ SEK: 99 });
    expect(body.subscriptionScope).toBe("author");
  });

  it("returns every currency and no misleading single total for mixed-currency orders", async () => {
    mocks.createAdminClient.mockReturnValue(database({ orders: [
      order(15000, "2026-09-15T12:00:00Z"), order(4900, "2026-09-15T12:00:00Z", "eur"),
    ] }));
    const body = await (await GET(req())).json();
    expect(body.byCurrency).toEqual({ SEK: 150, EUR: 49 });
    expect(body.totalRevenue).toBeNull();
    expect(body.currency).toBeNull();
  });

  it("scopes selected-book sales to an owned book without attributing author MRR to it", async () => {
    mocks.resolveAuthorBooks.mockResolvedValue({ ok: true, bookIds: ["book-1", "book-2"], books: [] });
    const db = database({ orders: [
      order(15000, "2026-09-15T12:00:00Z"), order(4900, "2026-09-15T12:00:00Z", "sek", "book-2"),
    ] });
    mocks.createAdminClient.mockReturnValue(db);
    const body = await (await GET(req("?bookId=book-2"))).json();
    expect(body.byCurrency).toEqual({ SEK: 49 });
    expect(body.bookId).toBe("book-2");
    expect(body.subscriptionScope).toBe("author");
    expect(db.filters).toContainEqual(["orders", "in", "book_id", ["book-2"]]);
  });

  it("rejects a selected book outside session ownership before service-role reads", async () => {
    expect((await GET(req("?bookId=someone-elses-book"))).status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("does not expose a first-page sum when a later order page fails", async () => {
    mocks.createAdminClient.mockReturnValue(database({ orders: Array.from({ length: 1001 }, () => order(100, "2026-09-15T12:00:00Z")) }, true));
    const body = await (await GET(req())).json();
    expect(body.partial).toBe(true);
    expect(body.totalRevenue).toBeNull();
    expect(body.orderRevenue).toBeNull();
    expect(body.byCurrency).toBeNull();
    expect(body.errors).toContain("orders");
  });

  it("does not read any service-role rows when authentication fails", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValue({ user: null, response: new Response(null, { status: 401 }) });
    expect((await GET(req())).status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});


describe("subscription currency minor units", () => {
  it.each([
    ["JPY", 1500, 1500], ["KRW", 1500, 1500],
    ["KWD", 1005, 1.005], ["BHD", 1005, 1.005],
    ["SEK", 1500, 15], ["ISK", 1500, 15], ["UGX", 1500, 15],
  ])("reports %s MRR without changing paid-order units", async (currency, minor, expected) => {
    mocks.createAdminClient.mockReturnValue(adminStub({
      orders: [{ amount: 15000, currency: "SEK" }],
      author_subscriptions: [{ amount_monthly: minor, currency }],
    }, []));
    const body = await (await GET(req())).json();
    expect(body.subscriptionMRR).toBe(expected);
    expect(body.subscriptionByCurrency).toEqual({ [currency]: expected });
    expect(body.subscriptionCurrency).toBe(currency);
    expect(body.totalRevenue).toBe(150);
    expect(body.byCurrency).toEqual({ SEK: 150 });
  });

  it("converts summed minor-unit buckets independently without currency mixing", async () => {
    mocks.createAdminClient.mockReturnValue(adminStub({
      author_subscriptions: [
        { amount_monthly: 1500, currency: "jpy" },
        { amount_monthly: 2500, currency: "JPY" },
        { amount_monthly: 1005, currency: "kwd" },
        { amount_monthly: 1500, currency: "sek" },
      ],
    }, []));
    const body = await (await GET(req())).json();
    expect(body.subscriptionByCurrency).toEqual({ JPY: 4000, KWD: 1.005, SEK: 15 });
    expect(body.subscriptionMRR).toBeNull();
    expect(body.subscriptionCurrency).toBeNull();
  });
});
