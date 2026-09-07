import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), createAdminClient: vi.fn(),
  createStripeCheckoutSession: vi.fn(), getStripeCheckoutSession: vi.fn(),
  logAnalyticsEvent: vi.fn(), sendPurchaseReceipt: vi.fn(), getBillingStateForUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/env", () => ({ assertPublicEnv: vi.fn() }));
vi.mock("@/lib/billing/server", () => ({ getBillingStateForUser: mocks.getBillingStateForUser }));
vi.mock("@/lib/payments/stripe", () => ({
  createStripeCheckoutSession: mocks.createStripeCheckoutSession,
  getStripeCheckoutSession: mocks.getStripeCheckoutSession,
}));
vi.mock("@/lib/analytics/events", () => ({ logAnalyticsEvent: mocks.logAnalyticsEvent }));
vi.mock("@/lib/payments/purchase-receipt", async (original) => ({
  ...(await original<typeof import("@/lib/payments/purchase-receipt")>()),
  sendPurchaseReceipt: mocks.sendPurchaseReceipt,
}));
import { POST } from "./route";
import { confirmStripeBookPurchase } from "@/lib/payments/purchase";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };
type Call = {
  table: string; operation: string; fields: string; payload: Row;
  filters: Array<[string, string, unknown]>; ordering: Array<[string, unknown]>; limit?: number;
};
const bookId = "11111111-1111-4111-8111-111111111111";
const userId = "reader-1";
const missingColumn = { code: "42703", message: "column orders.chapter_id does not exist" };
function order(i = 1, overrides: Row = {}): Row {
  return { id: `order-${i}`, user_id: userId, book_id: bookId, status: "pending", provider: "stripe",
    amount: 1299, currency: "SEK", stripe_session_id: `cs_${i}`, chapter_id: null,
    created_at: `2020-01-${String(i).padStart(2, "0")}T00:00:00Z`, ...overrides };
}
function session(i = 1, overrides: Row = {}): Row {
  return { id: `cs_${i}`, status: "open", payment_status: "unpaid", url: `https://checkout.stripe.com/c/pay/cs_${i}`,
    amount_total: 1299, currency: "sek", metadata: { order_id: `order-${i}`, user_id: userId, book_id: bookId }, ...overrides };
}

// An inert transport that applies real query predicates, projections and writes.
// Unexpected tables/RPCs throw, so tests cannot reach any live service.
class Transport {
  calls: Call[] = [];
  rows: Row[];
  entitlements: Row[] = [];
  legacyOrders = false;
  legacyEntitlements = false;
  book: Row = { id: bookId, title: "Test book", author_id: "author-1", status: "PUBLISHED",
    price_amount: 4900, price_currency: "SEK", pricing_model: "book_only" };
  override?: (call: Call) => Result | undefined;
  beforeWrite?: (call: Call) => void;
  finalizerError = true;
  rpc = vi.fn(async () => ({ data: null, error: this.finalizerError ? { code: "57014" } : null }));
  auth = { getUser: vi.fn(async () => ({ data: { user: { id: userId, email: "inert@example.invalid" } } })) };
  constructor(rows: Row[] = []) { this.rows = rows; }
  from(table: string) {
    const call: Call = { table, operation: "select", fields: "*", payload: {}, filters: [], ordering: [] };
    let execution: Promise<Result> | undefined;
    const execute = async (): Promise<Result> => {
      if (!execution) execution = Promise.resolve().then(() => {
        this.calls.push(call);
        if (call.operation !== "select") this.beforeWrite?.(call);
        const override = this.override?.(call);
        if (override) return override;
        if (table === "orders" && this.legacyOrders && (call.filters.some(([, key]) => key === "chapter_id")
          || (call.operation === "insert" && Object.hasOwn(call.payload, "chapter_id")))) {
          return { data: null, error: missingColumn };
        }
        if (table === "entitlements" && this.legacyEntitlements && call.filters.some(([, key]) => key === "chapter_id")) {
          return { data: null, error: { code: "42703", message: "column entitlements.chapter_id does not exist" } };
        }
        const source = table === "orders" ? this.rows : table === "books" ? [this.book]
          : table === "entitlements" ? this.entitlements : table === "author_subscriptions" ? [] : null;
        if (!source) throw new Error(`Unexpected table ${table}`);
        if (call.operation === "insert") {
          const inserted = { id: "order-new", stripe_session_id: null, ...call.payload };
          this.rows.push(inserted);
          return { data: [this.project(inserted, call.fields)], error: null };
        }
        let selected = source.filter((row) => call.filters.every(([op, key, value]) => {
          if (op === "in") return (value as unknown[]).includes(row[key]);
          if (op === "not") return row[key] !== value;
          if (op === "gte") return String(row[key]) >= String(value);
          return row[key] === value;
        }));
        for (const [key, options] of [...call.ordering].reverse()) {
          selected.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * ((options as { ascending: boolean }).ascending ? 1 : -1));
        }
        if (call.limit !== undefined) selected = selected.slice(0, call.limit);
        if (call.operation === "update") selected.forEach((row) => Object.assign(row, call.payload));
        return { data: selected.map((row) => this.project(row, call.fields)), error: null };
      });
      return execution;
    };
    const single = async () => {
      const result = await execute();
      return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data };
    };
    const chain = {
      select: (fields: string) => { call.fields = fields; return chain; },
      insert: (payload: Row) => { call.operation = "insert"; call.payload = payload; return chain; },
      update: (payload: Row) => { call.operation = "update"; call.payload = payload; return chain; },
      eq: (key: string, value: unknown) => { call.filters.push(["eq", key, value]); return chain; },
      is: (key: string, value: unknown) => { call.filters.push(["is", key, value]); return chain; },
      in: (key: string, value: unknown[]) => { call.filters.push(["in", key, value]); return chain; },
      not: (key: string, _op: string, value: unknown) => { call.filters.push(["not", key, value]); return chain; },
      gte: (key: string, value: unknown) => { call.filters.push(["gte", key, value]); return chain; },
      order: (key: string, options: unknown) => { call.ordering.push([key, options]); return chain; },
      limit: (value: number) => { call.limit = value; return chain; },
      maybeSingle: single, single,
      then: (resolve: (result: Result) => unknown, reject: (error: unknown) => unknown) => execute().then(resolve, reject),
    };
    return chain;
  }
  project(row: Row, fields: string) {
    return fields === "*" ? { ...row } : Object.fromEntries(fields.split(",").map((key) => [key.trim(), row[key.trim()]]));
  }
  writes() { return this.calls.filter((call) => call.operation !== "select"); }
}
let db: Transport;
async function checkout(body?: Row) {
  const response = await POST(new Request(`http://localhost:3019/api/books/${bookId}/purchase/checkout`, {
    method: "POST", ...(body ? { body: JSON.stringify(body) } : {}),
  }), { params: Promise.resolve({ id: bookId }) });
  return { status: response.status, body: await response.json() };
}
function noCreation() {
  expect(mocks.createStripeCheckoutSession).not.toHaveBeenCalled();
  expect(db.calls.filter((call) => call.operation === "insert")).toEqual([]);
}
function readKind(call: Call) {
  return call.table === "orders" && call.operation === "select"
    ? call.filters.some(([, key, value]) => key === "status" && value === "paid") ? "paid" : "attempts" : "other";
}
beforeEach(() => {
  vi.clearAllMocks();
  db = new Transport();
  mocks.createClient.mockImplementation(async () => db);
  mocks.createAdminClient.mockImplementation(() => db);
  mocks.createStripeCheckoutSession.mockResolvedValue({ id: "cs_new", url: "https://checkout.stripe.com/c/pay/cs_new" });
  mocks.getStripeCheckoutSession.mockImplementation(async (id: string) => session(Number(id.slice(3))));
  mocks.getBillingStateForUser.mockResolvedValue({ ok: false });
  mocks.logAnalyticsEvent.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("book checkout repayment guard", () => {
  it("uses actual legacy entitlement lookup before creating anything", async () => {
    db.legacyEntitlements = true;
    db.entitlements = [{ id: "ent-1", user_id: userId, book_id: bookId, source: "purchase" }];
    expect(await checkout()).toMatchObject({ status: 409, body: { error: "ALREADY_UNLOCKED" } });
    noCreation();
    expect(db.calls.filter((c) => c.table === "entitlements").map((c) => c.fields)).toEqual(["id", "*"]);
  });
  it("stops on unavailable entitlement verification", async () => {
    db.override = (c) => c.table === "entitlements" ? { data: null, error: { code: "42501" } } : undefined;
    expect(await checkout()).toMatchObject({ status: 503, body: { error: "CHECKOUT_UNAVAILABLE" } });
    noCreation();
  });
  it("allows an absent legacy entitlement and preserves server-owned new checkout data", async () => {
    db.legacyEntitlements = true;
    expect(await checkout()).toMatchObject({ status: 200, body: { orderId: "order-new", amount: 4900, currency: "SEK" } });
    expect(mocks.createStripeCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 4900, currency: "SEK",
      customerEmail: "inert@example.invalid", bookTitle: "Test book", metadata: { orderId: "order-new", userId, bookId, paymentType: "book_purchase", amountMinor: 4900 } }));
    const bind = db.writes().find((c) => c.payload.stripe_session_id);
    expect(bind?.filters).toEqual(expect.arrayContaining([["eq", "id", "order-new"], ["eq", "user_id", userId],
      ["eq", "book_id", bookId], ["eq", "status", "pending"], ["is", "stripe_session_id", null]]));
    expect(bind?.fields).toBe("id");
    expect(db.calls.find((call) => call.operation === "insert")?.payload).not.toHaveProperty("chapter_id");
  });
  it("models legacy insert rejection so a chapter column cannot slip into new whole-book orders", async () => {
    db.legacyOrders = true;
    const incompatible = await db.from("orders").insert({ chapter_id: null }).select("id").single();
    expect(incompatible).toEqual({ data: null, error: missingColumn });
    expect(db.rows).toEqual([]);
    db.calls = [];
    expect(await checkout()).toMatchObject({ status: 200 });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).not.toHaveProperty("chapter_id");
  });
  it("preserves independent subscription access after an absent entitlement", async () => {
    mocks.getBillingStateForUser.mockResolvedValue({ ok: true, state: { isPlusActive: true } });
    expect(await checkout()).toMatchObject({ body: { error: "ALREADY_UNLOCKED" } });
    noCreation();
  });
  it.each([
    [{ author_id: userId }, "AUTHOR_CANNOT_BUY_OWN_BOOK"],
    [{ price_amount: 0 }, "BOOK_IS_FREE"],
    [{ status: "DRAFT" }, "BOOK_NOT_FOUND"],
    [{ pricing_model: "unknown" }, "INVALID_BOOK_PRICING"],
    [{ price_currency: "JPY" }, "INVALID_BOOK_PRICING"],
  ])("preserves the existing owner/free/publication/pricing guard %j", async (book, error) => {
    Object.assign(db.book, book);
    expect(await checkout()).toMatchObject({ body: { error } });
    noCreation();
  });
  it.each([null, "cs_1"])("blocks an old paid order without entitlement or session (%j)", async (binding) => {
    db.rows = [order(1, { status: "paid", stripe_session_id: binding, provider: "historical-provider" })];
    const result = await checkout();
    expect(result).toMatchObject({ status: 409, body: { error: "CHECKOUT_PAYMENT_RECORDED" } });
    noCreation();
    expect(mocks.getStripeCheckoutSession).not.toHaveBeenCalled();
    expect(db.writes()).toEqual([]);
  });
  it("blocks actual B receipt claim followed by a failed finalizer without granting or repaying", async () => {
    db.rows = [order()];
    mocks.getStripeCheckoutSession.mockResolvedValue(session(1, { status: "complete", payment_status: "paid" }));
    expect(await confirmStripeBookPurchase({ orderId: "order-1", sessionId: "cs_1", userId, bookId })).toBe("processing");
    expect(db.rows[0].status).toBe("paid");
    const rpcCount = db.rpc.mock.calls.length;
    expect(await checkout()).toMatchObject({ body: { error: "CHECKOUT_PAYMENT_RECORDED" } });
    noCreation();
    expect(db.rpc).toHaveBeenCalledTimes(rpcCount);
    expect(mocks.sendPurchaseReceipt).not.toHaveBeenCalled();
  });
  it.each([2, 3, 25])("verifies %i already-failed expired attempts before permitting a new purchase", async (count) => {
    db.rows = Array.from({ length: count }, (_, i) => order(i + 1, { status: "failed" }));
    mocks.getStripeCheckoutSession.mockImplementation(async (id: string) => session(Number(id.slice(3)), { status: "expired", url: null }));
    expect(await checkout()).toMatchObject({ status: 200 });
    const terminalWrites = db.writes().filter((c) => c.payload.status === "failed");
    expect(terminalWrites).toHaveLength(count);
    for (const call of terminalWrites) {
      expect(call.fields).toBe("id");
      expect(call.filters).toEqual(expect.arrayContaining([["eq", "user_id", userId], ["eq", "book_id", bookId], ["in", "status", ["pending", "failed"]]]));
      expect(call.filters.some(([, key]) => key === "stripe_session_id")).toBe(true);
    }
  });
  it("classifies an aged open attempt first and still verifies later terminals before reusing stored price", async () => {
    db.rows = [order(1, { created_at: "2024-01-01" }), order(2, { created_at: "2020-01-01", status: "failed" })];
    mocks.getStripeCheckoutSession.mockImplementation(async (id: string) => session(Number(id.slice(3)), id === "cs_2" ? { status: "expired" } : {}));
    expect(await checkout()).toMatchObject({ status: 200, body: { orderId: "order-1", amount: 1299, currency: "SEK" } });
    noCreation();
    expect(mocks.getStripeCheckoutSession).toHaveBeenCalledTimes(2);
    expect(db.writes()).toHaveLength(1);
  });
  it("reuses a single modern open unpaid session with verified metadata and stored pricing", async () => {
    db.rows = [order()];
    expect(await checkout()).toEqual({ status: 200, body: { checkoutUrl: "https://checkout.stripe.com/c/pay/cs_1",
      orderId: "order-1", provider: "stripe", amount: 1299, currency: "SEK" } });
    noCreation();
    expect(db.writes()).toEqual([]);
  });
  it("does not reuse one open session when a second open session exists", async () => {
    db.rows = [order(1), order(2)];
    const result = await checkout();
    expect(result).toMatchObject({ status: 409, body: { error: "CHECKOUT_PROCESSING" } });
    expect(result.body.purchaseStatusUrl).toBeUndefined();
    noCreation();
  });
  it.each([
    ["null binding", { stripe_session_id: null }, {}],
    ["complete unpaid", {}, { status: "complete" }],
    ["async failed", { status: "failed" }, { status: "complete" }],
    ["paid not finalized", {}, { status: "complete", payment_status: "paid" }],
    ["unknown state", {}, { status: "mystery" }],
    ["unknown payment", {}, { status: "expired", payment_status: "mystery" }],
    ["missing open URL", {}, { url: null }],
  ])("blocks %s", async (_name, row, response) => {
    db.rows = [order(1, row)];
    mocks.getStripeCheckoutSession.mockResolvedValue(session(1, response));
    const result = await checkout();
    expect(result).toMatchObject({ status: 409, body: { error: "CHECKOUT_PROCESSING" } });
    if ((row as Row).stripe_session_id === null) expect(result.body.purchaseStatusUrl).toBeUndefined();
    noCreation();
    expect(db.writes()).toEqual([]);
  });
  it("returns a bounded owned status link on single-session provider uncertainty without leaking provider detail", async () => {
    db.rows = [order()];
    mocks.getStripeCheckoutSession.mockRejectedValue(new Error("secret provider payment detail"));
    const result = await checkout();
    expect(result).toMatchObject({ status: 409, body: { error: "CHECKOUT_PROCESSING",
      purchaseStatusUrl: `/reader/books/${bookId}/purchase/success?order_id=order-1&session_id=cs_1` } });
    noCreation();
    expect(JSON.stringify([result, vi.mocked(console.error).mock.calls, vi.mocked(console.warn).mock.calls])).not.toContain("secret provider");
  });
  it("returns explicit bounded-history unavailability repeatedly at 26 without pretending progress", async () => {
    db.rows = Array.from({ length: 26 }, (_, i) => order(i + 1));
    for (let i = 0; i < 2; i++) {
      const result = await checkout();
      expect(result).toMatchObject({ status: 503, body: { error: "CHECKOUT_HISTORY_UNAVAILABLE", reason: "history_verification_limit" } });
      expect(result.body.purchaseStatusUrl).toBeUndefined();
    }
    noCreation();
    expect(mocks.getStripeCheckoutSession).not.toHaveBeenCalled();
    expect(db.writes()).toEqual([]);
    const reads = db.calls.filter((c) => readKind(c) === "attempts");
    expect(reads.every((c) => c.fields === "*" && c.limit === 26 && c.ordering.map(([key]) => key).join() === "created_at,id")).toBe(true);
    expect(reads.every((c) => c.filters.some(([op, key, value]) => op === "in" && key === "status" && JSON.stringify(value) === '["pending","failed"]'))).toBe(true);
    expect(reads.every((c) => !c.filters.some(([op, key]) => op === "gte" || key === "stripe_session_id"))).toBe(true);
  });
  it.each(["paid", "attempts"])("retries only the exact chapter column error for %s using identical other predicates", async (kind) => {
    db.legacyOrders = true;
    db.rows = [{ ...order(1, kind === "paid" ? { status: "paid" } : {}) }];
    delete db.rows[0].chapter_id;
    expect((await checkout()).status).toBe(kind === "paid" ? 409 : 200);
    noCreation();
    const reads = db.calls.filter((c) => readKind(c) === kind);
    expect(reads).toHaveLength(2);
    expect(reads[0].fields).toBe("*");
    expect(reads[1].filters).toEqual(reads[0].filters.filter(([, key]) => key !== "chapter_id"));
    expect(reads[1].ordering).toEqual(reads[0].ordering);
    expect(reads[1].limit).toEqual(reads[0].limit);
  });
  it.each(["paid", "attempts"])("does not retry unrelated %s read errors", async (kind) => {
    for (const error of [{ code: "42703", message: "column orders.provider does not exist" }, { code: "PGRST204" }, { code: "42501" }, { code: "57014" }]) {
      db.calls = [];
      db.override = (c) => readKind(c) === kind ? { data: null, error } : undefined;
      expect(await checkout()).toMatchObject({ status: 503, body: { error: "CHECKOUT_UNAVAILABLE" } });
      expect(db.calls.filter((c) => readKind(c) === kind)).toHaveLength(1);
      noCreation();
    }
  });
  it.each(["paid", "attempts"])("rejects malformed or wrongly scoped full %s rows even on legacy fallback", async (kind) => {
    db.legacyOrders = true;
    for (const bad of [false, null, [], { id: "" }, order(1, { user_id: "other" }), order(1, { book_id: "other" }),
      order(1, { chapter_id: "chapter" }), order(1, { chapter_id: undefined }), order(1, { chapter_id: 3 }), order(1, { status: "other" })]) {
      db.override = (c) => readKind(c) === kind && !c.filters.some(([, key]) => key === "chapter_id")
        ? { data: [bad], error: null } : undefined;
      expect(await checkout()).toMatchObject({ status: 503, body: { error: "CHECKOUT_UNAVAILABLE" } });
      noCreation();
    }
  });
  it.each([{ provider: "other" }, { amount: "1299" }, { amount: 0 }, { amount: 1.5 }, { currency: " " }, { currency: 7 }, { stripe_session_id: " " }])(
    "does not retrieve malformed attempt %j", async (bad) => {
      db.rows = [order(1, bad)];
      expect((await checkout()).status).toBeGreaterThanOrEqual(400);
      noCreation();
      expect(mocks.getStripeCheckoutSession).not.toHaveBeenCalled();
    });
  it.each([
    { id: "cs_other" }, { id: " cs_1 " }, { metadata: null }, { metadata: [] }, { metadata: {} },
    { metadata: { ...session().metadata as Row, user_id: "other" } },
    { metadata: { ...session().metadata as Row, order_id: 1 } },
    { metadata: { ...session().metadata as Row, book_id: "other" } },
    { metadata: { ...session().metadata as Row, payment_type: "donation" } },
    { metadata: { ...session().metadata as Row, payment_kind: "book_order" } },
    { metadata: { ...session().metadata as Row, chapter_id: "chapter" } },
    { amount_total: 4900 }, { amount_total: "1299" }, { amount_total: null }, { currency: "usd" }, { currency: null },
  ])("blocks malformed or conflicting provider identity/scope %j", async (bad) => {
    db.rows = [order()];
    mocks.getStripeCheckoutSession.mockResolvedValue(session(1, bad));
    expect(await checkout()).toMatchObject({ status: 409, body: { error: "CHECKOUT_PROCESSING" } });
    noCreation();
    expect(db.writes()).toEqual([]);
  });
  it.each(["error", "zero", "wrong", "paid race", "binding race"])("stops on a checked terminal write %s", async (failure) => {
    db.rows = [order(1, { status: "failed" })];
    mocks.getStripeCheckoutSession.mockResolvedValue(session(1, { status: "expired", url: null }));
    db.override = (c) => c.payload.status === "failed" && !failure.includes("race")
      ? { data: failure === "wrong" ? [{ id: "other" }] : null, error: failure === "error" ? { code: "57014" } : null } : undefined;
    db.beforeWrite = (c) => { if (c.payload.status === "failed" && failure.includes("race")) db.rows[0][failure === "paid race" ? "status" : "stripe_session_id"] = failure === "paid race" ? "paid" : "cs_other"; };
    expect(await checkout()).toMatchObject({ status: 409, body: { error: "CHECKOUT_PROCESSING" } });
    noCreation();
    if (failure === "paid race") expect(db.rows[0].status).toBe("paid");
  });
  it.each(["throw", "missing ID", "missing URL", "unsafe URL"])("keeps a new order pending on provider creation %s", async (failure) => {
    if (failure === "throw") mocks.createStripeCheckoutSession.mockRejectedValue(new Error("secret response lost"));
    else mocks.createStripeCheckoutSession.mockResolvedValue({ id: failure === "missing ID" ? "" : "cs_new", url: failure === "missing URL" ? null : failure === "unsafe URL" ? "javascript:alert(1)" : "https://checkout.stripe.com/c/pay/cs_new" });
    expect(await checkout()).toMatchObject({ status: 409, body: { error: "CHECKOUT_PROCESSING" } });
    expect(db.rows[0].status).toBe("pending");
    expect(db.writes().filter((c) => c.operation === "update")).toEqual([]);
    expect(mocks.createStripeCheckoutSession).toHaveBeenCalledTimes(1);
  });
  it.each(["error", "zero", "wrong", "paid race", "throw"])("withholds URL and keeps the order on new binding %s", async (failure) => {
    db.override = (c) => {
      if (!c.payload.stripe_session_id || failure === "paid race") return undefined;
      if (failure === "throw") throw new Error("secret write response lost");
      return { data: failure === "wrong" ? [{ id: "other" }] : null, error: failure === "error" ? { code: "57014" } : null };
    };
    db.beforeWrite = (c) => { if (c.payload.stripe_session_id && failure === "paid race") db.rows[0].status = "paid"; };
    const result = await checkout();
    expect(result).toMatchObject({ status: 409, body: { error: "CHECKOUT_PROCESSING" } });
    expect(result.body.checkoutUrl).toBeUndefined();
    expect(db.rows[0].status).toBe(failure === "paid race" ? "paid" : "pending");
    expect(db.writes().some((c) => c.payload.status === "failed")).toBe(false);
  });
  it.each(["error", "missing ID", "blank ID", "malformed ID", "throw after insert"])(
    "does not call the provider on an ambiguous insert result (%s)", async (failure) => {
      db.override = (c) => {
        if (c.operation !== "insert") return undefined;
        if (failure === "throw after insert") {
          db.rows.push({ id: "order-created", ...c.payload, stripe_session_id: null });
          throw new Error("inert insert response lost");
        }
        return { data: failure === "blank ID" ? { id: " " } : failure === "malformed ID" ? { id: 4 } : null,
          error: failure === "error" ? { code: "57014" } : null };
      };
      const result = await checkout();
      expect(result).toMatchObject({ status: 409, body: { error: "CHECKOUT_PROCESSING" } });
      expect(result.body.checkoutUrl).toBeUndefined();
      expect(mocks.createStripeCheckoutSession).not.toHaveBeenCalled();
      expect(db.writes().some((c) => c.operation === "update")).toBe(false);
      if (failure === "throw after insert") expect(db.rows[0].status).toBe("pending");
    });
  it("keeps a stored binding pending when the bind response is lost", async () => {
    db.override = (c) => {
      if (!c.payload.stripe_session_id) return undefined;
      Object.assign(db.rows[0], c.payload);
      throw new Error("inert bind response lost");
    };
    expect(await checkout()).toMatchObject({ body: { error: "CHECKOUT_PROCESSING" } });
    expect(db.rows[0]).toMatchObject({ status: "pending", stripe_session_id: "cs_new" });
    expect(db.writes().some((c) => c.payload.status === "failed")).toBe(false);
  });
  it("does not reuse an open candidate before a later unknown attempt is classified", async () => {
    db.rows = [order(1, { created_at: "2024-01-01" }), order(2, { created_at: "2020-01-01" })];
    mocks.getStripeCheckoutSession.mockImplementation(async (id: string) => session(Number(id.slice(3)), id === "cs_2" ? { status: "complete" } : {}));
    const result = await checkout();
    expect(result).toMatchObject({ status: 409, body: { error: "CHECKOUT_PROCESSING" } });
    expect(result.body.purchaseStatusUrl).toBeUndefined();
    noCreation();
  });
  it.each(["paid", "attempts"])("stops when the %s legacy retry also fails or throws", async (kind) => {
    db.legacyOrders = true;
    for (const throws of [false, true]) {
      db.calls = [];
      db.override = (c) => {
        if (readKind(c) !== kind || c.filters.some(([, key]) => key === "chapter_id")) return undefined;
        if (throws) throw new Error("inert retry timeout");
        return { data: null, error: missingColumn };
      };
      expect(await checkout()).toMatchObject({ status: 503, body: { error: "CHECKOUT_UNAVAILABLE" } });
      expect(db.calls.filter((c) => readKind(c) === kind)).toHaveLength(2);
      noCreation();
    }
  });
  it("keeps analytics nonfatal and logs only classified information", async () => {
    mocks.logAnalyticsEvent.mockRejectedValue(new Error("secret analytics detail"));
    expect(await checkout()).toMatchObject({ status: 200 });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("secret analytics detail");
  });
  it.each(["per_chapter", "book_only"])("blocks chapter initiation for %s before all writes/provider calls", async (model) => {
    db.book.pricing_model = model;
    expect(await checkout({ chapter_id: "chapter-1" })).toMatchObject({ status: 503, body: { error: "CHAPTER_CHECKOUT_UNAVAILABLE" } });
    noCreation();
    expect(db.writes()).toEqual([]);
  });
  it("blocks per-chapter initiation even without a chapter ID", async () => {
    db.book.pricing_model = "per_chapter";
    expect(await checkout()).toMatchObject({ status: 503, body: { error: "CHAPTER_CHECKOUT_UNAVAILABLE" } });
    noCreation();
  });
});
