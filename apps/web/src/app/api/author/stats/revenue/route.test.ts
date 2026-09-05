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

// Only ownership resolution is stubbed. fetchAllRows, the currency tallies and
// SETTLED_PAYMENT_STATUS stay real, so the paging and money maths under test are
// the ones that actually ship.
vi.mock("@/lib/author/stats-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/author/stats-scope")>();
  return { ...actual, resolveAuthorBooks: mocks.resolveAuthorBooks };
});

const { GET } = await import("./route");

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

    await GET();

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

    const body = await (await GET()).json();

    expect(body.orderRevenue).toBe(150);
    expect(body.donationRevenue).toBe(0);
    expect(body.currency).toBe("SEK");
  });

  it("keeps the donation line at zero even when orders are empty", async () => {
    mocks.createAdminClient.mockReturnValue(adminStub({ orders: [] }, []));

    const body = await (await GET()).json();

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

    const body = await (await GET()).json();

    expect(body.partial).toBe(true);
  });

  it("does not mark a healthy answer partial", async () => {
    mocks.createAdminClient.mockReturnValue(
      adminStub({ orders: [{ amount: 15000, currency: "sek" }] }, [])
    );

    const body = await (await GET()).json();

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

    const body = await (await GET()).json();

    expect(body.orderRevenue).toBe(200);
    expect(body.totalRevenue).toBe(200);
  });
});
