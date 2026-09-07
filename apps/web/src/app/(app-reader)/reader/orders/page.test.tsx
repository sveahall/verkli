import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  link: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`Redirect: ${url}`); }),
  forbidden: vi.fn(() => { throw new Error("Unexpected payment side effect"); }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({
  default: ({ children, prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean | null }) => {
    mocks.link({ href: props.href, prefetch });
    return <a {...props}>{children}</a>;
  },
}));
vi.mock("@/lib/payments/purchase", () => ({ confirmStripeBookPurchase: mocks.forbidden }));
vi.mock("@/lib/payments/stripe", () => ({ getStripeCheckoutSession: mocks.forbidden, createStripeCheckoutSession: mocks.forbidden, createBookOrderCheckoutSession: mocks.forbidden }));
vi.mock("@/lib/payments/purchase-receipt", () => ({ claimPaidOrderForReceipt: mocks.forbidden, sendPurchaseReceipt: mocks.forbidden }));

const { default: ReaderOrdersPage } = await import("./page");
const userId = "reader-1";
type Row = Record<string, unknown>;
type Table = "orders" | "pod_orders" | "books";
type Result = { data: unknown; error: unknown };
type Fixture = {
  orders?: Row[];
  pod_orders?: Row[];
  books?: Row[];
  legacy?: boolean;
  results?: Partial<Record<Table, Result>>;
  throws?: Table;
  signedOut?: boolean;
};
type Query = {
  admin: boolean;
  table: Table;
  select?: string;
  filters: [string, string, unknown][];
  orders: [string, { ascending: boolean }][];
};
const digital = (overrides: Row = {}): Row => ({
  id: "digital-1", user_id: userId, book_id: "book-1", amount: 1299, currency: "sek",
  status: "paid", created_at: "2026-09-01T12:00:00Z", stripe_session_id: "cs_owned_1",
  provider: "stripe", private_marker: "PRIVATE_ORDER_DETAILS", ...overrides,
});
const printed = (overrides: Row = {}): Row => ({
  ...digital(), id: "printed-1", book_id: "book-2", format: "Paperback", status: "shipped",
  shipping_address: { address: "PRIVATE_SHIPPING_ADDRESS" }, ...overrides,
});
const books: Row[] = [
  { id: "book-1", title: "A northern light", cover_image: null, status: "PUBLISHED" },
  { id: "book-2", title: "An island in winter", cover_image: null, status: "PUBLISHED" },
];

// Inert boundary only: execute filters, projection and ordering from the actual
// page. Explicit result overrides model malformed or incorrectly scoped replies.
function makeTransport(fixture: Fixture) {
  const calls: Query[] = [];
  const violations: string[] = [];
  function client(admin: boolean) {
    return {
      auth: { getUser: async () => ({ data: { user: fixture.signedOut ? null : { id: userId } }, error: null }) },
      from(table: Table) {
        const query: Query = { table, admin, filters: [], orders: [] };
        calls.push(query);
        const result = () => {
          if (!["orders", "pod_orders", "books"].includes(table) || admin !== (table === "books")) {
            violations.push("Unexpected table or client");
            throw new Error("Unexpected query");
          }
          if (fixture.throws === table) throw new Error("PRIVATE_TRANSPORT_DETAILS");
          if (fixture.results?.[table]) return fixture.results[table];
          const columns = query.select?.split(",").map((column) => column.trim()) ?? [];
          if (fixture.legacy && table === "orders" && columns.includes("chapter_id")) {
            return { data: null, error: { code: "42703", message: "column orders.chapter_id does not exist" } };
          }
          let rows = [...(fixture[table] ?? (table === "books" ? books : []))];
          for (const [operation, column, value] of query.filters) {
            rows = rows.filter((row) => operation === "eq" ? row[column] === value : (value as unknown[]).includes(row[column]));
          }
          for (const [column, options] of query.orders) {
            rows.sort((left, right) => String(left[column]).localeCompare(String(right[column])) * (options.ascending ? 1 : -1));
          }
          return {
            data: rows.map((row) => query.select === "*" ? { ...row } : Object.fromEntries(columns.map((column) => [column, row[column]]))),
            error: null,
          };
        };
        const chain = {
          select(value: string) { query.select = value; return proxy; },
          eq(column: string, value: unknown) { query.filters.push(["eq", column, value]); return proxy; },
          in(column: string, value: unknown) { query.filters.push(["in", column, value]); return proxy; },
          order(column: string, options: { ascending: boolean }) { query.orders.push([column, options]); return proxy; },
          then(resolve: (value: Result) => unknown, reject?: (error: unknown) => unknown) {
            return Promise.resolve().then(result).then(resolve, reject);
          },
        };
        const proxy = new Proxy(chain, {
          get(target, property, receiver) {
            if (typeof property === "string" && !(property in target)) {
              violations.push(`Unexpected operation ${property}`);
              throw new Error("Unexpected database operation");
            }
            return Reflect.get(target, property, receiver);
          },
        });
        return proxy;
      },
    };
  }
  return { calls, violations, session: client(false), admin: client(true) };
}

async function renderOrders(fixture: Fixture = {}) {
  const io = makeTransport(fixture);
  mocks.createClient.mockResolvedValue(io.session);
  mocks.createAdminClient.mockReturnValue(io.admin);
  const tree = await ReaderOrdersPage();
  const html = renderToStaticMarkup(tree);
  expect(io.violations).toEqual([]);
  expect(mocks.forbidden).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.stringify(tree)).not.toMatch(/PRIVATE_|shipping_address|private_marker/);
  expect(html).not.toMatch(/PRIVATE_|try paying again|start checkout again|buy again/i);
  return { html, calls: io.calls };
}

function expectUnavailable(html: string, source: "Digital purchases" | "Printed copies") {
  expect(html).toContain(source);
  expect(html).toMatch(/unavailable|could not|couldn.t/i);
  expect(html).toContain('href="/reader/orders"');
  expect(html).not.toContain("No orders yet");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("ReaderOrdersPage", () => {
  it("renders legacy purchases using an owned wildcard read without leaking rows", async () => {
    const { html, calls } = await renderOrders({ legacy: true, orders: [digital()] });
    expect(html).toContain("A northern light");
    expect(html).toContain("Full book");
    expect(html).toContain("12.99 SEK");
    expect(html).toContain("Order digital-1");
    expect(html).not.toContain("No orders yet");
    expect(calls.find((call) => call.table === "orders")).toEqual({
      admin: false, table: "orders", select: "*",
      filters: [["eq", "user_id", userId]], orders: [["created_at", { ascending: false }]],
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("keeps modern whole-book and chapter labels and newest-first order", async () => {
    const { html } = await renderOrders({ orders: [
      digital({ id: "older-whole", chapter_id: null }),
      digital({ id: "newer-chapter", chapter_id: "chapter-1", created_at: "2026-09-02T12:00:00Z" }),
    ] });
    expect(html).toContain("Full book");
    expect(html).toContain("Single chapter");
    expect(html.indexOf("newer-chapter")).toBeLessThan(html.indexOf("older-whole"));
    expect(html).toContain("Sep 2, 2026");
  });

  it("shows true empty only after both sources succeed empty", async () => {
    const { html, calls } = await renderOrders();
    expect(html).toContain("No orders yet");
    expect(calls).toHaveLength(2);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each(["orders", "pod_orders"] as const)("preserves the successful sibling when %s returns an error", async (table) => {
    const { html } = await renderOrders({ orders: [digital()], pod_orders: [printed()], results: {
      [table]: { data: [digital({ id: "untrusted-error-row" })], error: { code: "42501", message: "PRIVATE_DATABASE_DETAILS" } },
    } });
    expectUnavailable(html, table === "orders" ? "Digital purchases" : "Printed copies");
    expect(html).toContain(table === "orders" ? "An island in winter" : "A northern light");
    expect(html).not.toContain("untrusted-error-row");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain("42501");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("PRIVATE_");
  });

  it.each(["orders", "pod_orders"] as const)("preserves the successful sibling when %s throws", async (table) => {
    const { html } = await renderOrders({ orders: [digital()], pod_orders: [printed()], throws: table });
    expectUnavailable(html, table === "orders" ? "Digital purchases" : "Printed copies");
    expect(html).toContain(table === "orders" ? "An island in winter" : "A northern light");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("PRIVATE_");
  });

  it.each([null, {}, "not-an-array"])("treats malformed source data %j as unavailable", async (data) => {
    const { html } = await renderOrders({ results: { orders: { data, error: null }, pod_orders: { data, error: null } } });
    expectUnavailable(html, "Digital purchases");
    expectUnavailable(html, "Printed copies");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong owner", { user_id: "reader-2" }], ["missing owner", { user_id: undefined }],
    ["blank order ID", { id: " " }], ["object order ID", { id: {} }],
    ["undefined chapter", { chapter_id: undefined }], ["empty chapter", { chapter_id: "" }],
    ["blank chapter", { chapter_id: " " }], ["numeric chapter", { chapter_id: 42 }],
  ])("keeps a valid sibling when an invalid digital row has %s", async (_name, overrides) => {
    const { html, calls } = await renderOrders({ results: { orders: { data: [
      digital(), digital({ id: "invalid-order", book_id: "excluded-book", ...overrides }),
    ], error: null } } });
    expect(html).toContain("A northern light");
    expect(html).not.toContain("invalid-order");
    expect(html).not.toContain("excluded-book");
    expectUnavailable(html, "Digital purchases");
    expect(calls.find((call) => call.table === "books")?.filters).toEqual([["in", "id", ["book-1"]]]);
  });

  it("does not relabel an only malformed chapter as a full-book purchase or empty history", async () => {
    const { html } = await renderOrders({ orders: [digital({ chapter_id: false })] });
    expectUnavailable(html, "Digital purchases");
    expect(html).not.toContain("Full book");
  });

  it.each([null, "1299", "bad", NaN, Infinity, -1, 12.5])("does not coerce malformed money %j to a price", async (amount) => {
    const { html } = await renderOrders({ orders: [digital({ amount })] });
    expect(html).toContain("Order digital-1");
    expect(html).toContain("Amount unavailable");
    expect(html).not.toMatch(/0\.00 SEK|12\.99 SEK|NaN|Infinity/);
  });

  it.each([null, "", " ", {}, "not-a-currency"])("does not invent a currency for %j", async (currency) => {
    const { html } = await renderOrders({ orders: [digital({ currency })] });
    expect(html).toContain("Amount unavailable");
    expect(html).not.toContain("12.99");
  });

  it("preserves legitimate zero amounts and unavailable optional date/book fields", async () => {
    const { html } = await renderOrders({ orders: [digital({ amount: 0, book_id: null, created_at: null })] });
    expect(html).toContain("0.00 SEK");
    expect(html).toContain("Title unavailable");
    expect(html).toContain("Date unavailable");
    expect(html).toContain("Order digital-1");
  });

  it.each([
    ["pending", "Payment status pending"],
    ["paid", "Payment recorded"],
    ["failed", "Payment unconfirmed"],
  ])("describes %s truthfully without claiming finalized access or repayment", async (status, copy) => {
    const { html } = await renderOrders({ orders: [digital({ status })] });
    expect(html).toContain(copy);
    expect(html).toContain("Check purchase status");
    expect(html).not.toMatch(/\bBought\b|Payment failed|access restored|ready to read/i);
  });

  it.each(["refunded", "cancelled", "PRIVATE_ARBITRARY_STATUS", "constructor", null])("does not expose an unsupported digital status %j", async (status) => {
    const { html } = await renderOrders({ orders: [digital({ status })] });
    expect(html).toContain("Payment status unavailable");
    expect(html).not.toMatch(/Refunded|Cancelled|PRIVATE_ARBITRARY_STATUS|constructor/);
  });

  it("scopes admin metadata to the exact union of this user's valid displayed orders", async () => {
    const { html, calls } = await renderOrders({ orders: [digital(), digital({ id: "other", user_id: "reader-2", book_id: "excluded-book" })], pod_orders: [printed()] });
    expect(html).toContain("A northern light");
    expect(html).toContain("An island in winter");
    expect(calls.find((call) => call.table === "books")).toEqual({
      admin: true, table: "books", select: "id, title, cover_image, status",
      filters: [["in", "id", ["book-2", "book-1"]]], orders: [],
    });
    expect(calls.find((call) => call.table === "pod_orders")).toEqual({
      admin: false, table: "pod_orders", select: "id, book_id, format, amount, currency, status, created_at",
      filters: [["eq", "user_id", userId]], orders: [["created_at", { ascending: false }]],
    });
  });

  it.each(["returned", "thrown", "null", "missing"])("retains orders with explicit unavailable titles on %s metadata failures", async (kind) => {
    const { html } = await renderOrders({ orders: [digital()], pod_orders: [printed()],
      ...(kind === "thrown" ? { throws: "books" as const } : { results: { books: {
        data: kind === "missing" ? [] : null,
        error: kind === "returned" ? { code: "42501", message: "PRIVATE_METADATA_DETAILS" } : null,
      } } }),
    });
    expect(html).toContain("Title unavailable");
    expect(html).toContain("12.99 SEK");
    expect(html).toContain("Order digital-1");
    expect(html).toContain("Payment recorded");
    expect(html).not.toContain("No orders yet");
    expect(html).not.toContain('href="/reader/books/book-1"');
    expect(console.error).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("PRIVATE_");
  });

  it("keeps unlisted digital and printed titles without dead public links", async () => {
    const { html } = await renderOrders({ orders: [digital()], pod_orders: [printed()], books: books.map((book) => ({ ...book, status: "DRAFT" })) });
    expect(html).toContain("A northern light");
    expect(html).toContain("An island in winter");
    expect(html).not.toContain('href="/reader/books/book-1"');
    expect(html).not.toContain('href="/reader/books/book-2"');
    expect(html).toContain('href="/reader/library"');
  });

  it("links the exact owned order and session without automatically prefetching confirmation", async () => {
    const { html } = await renderOrders({ orders: [digital({ id: "order_owned-1", stripe_session_id: "cs_owned-2" })] });
    expect(html).toContain('href="/reader/books/book-1/purchase/success?order_id=order_owned-1&amp;session_id=cs_owned-2"');
    expect(html.match(/Check purchase status/g)).toHaveLength(1);
    expect(mocks.link).toHaveBeenCalledWith({
      href: "/reader/books/book-1/purchase/success?order_id=order_owned-1&session_id=cs_owned-2",
      prefetch: false,
    });
  });

  it.each([null, undefined, "", " cs_wrong ", "https://evil.invalid", {}, "s".repeat(201)])("provides support without a status link for invalid stored binding %j", async (stripe_session_id) => {
    const { html } = await renderOrders({ orders: [digital({ stripe_session_id })] });
    expect(html).not.toContain("Check purchase status");
    expect(html).not.toContain("purchase/success");
    expect(html).toMatch(/contact support/i);
    expect(html).toContain('href="/support"');
    expect(html).not.toMatch(/reload.*(fix|restore)|pay again/i);
  });

  it("does not use another user's stored session from a malformed reply", async () => {
    const { html } = await renderOrders({ results: { orders: { data: [digital({ user_id: "reader-2" })], error: null } } });
    expectUnavailable(html, "Digital purchases");
    expect(html).not.toContain("Check purchase status");
    expect(html).not.toContain("cs_owned_1");
  });

  it("retains printed status copy while hiding arbitrary statuses", async () => {
    const { html } = await renderOrders({ pod_orders: [printed(), printed({ id: "unknown-pod", status: "PRIVATE_POD_STATUS" })] });
    expect(html).toContain("Shipped");
    expect(html).toContain("Status unavailable");
    expect(html).toContain("Format: Paperback");
  });

  it("keeps the signed-out redirect and performs no order or admin reads", async () => {
    const io = makeTransport({ signedOut: true });
    mocks.createClient.mockResolvedValue(io.session);
    await expect(ReaderOrdersPage()).rejects.toThrow("Redirect: /reader/signin?next=/reader/orders");
    expect(io.calls).toEqual([]);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
