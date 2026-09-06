import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getStripeCheckoutSession: vi.fn(),
  logAnalyticsEvent: vi.fn(),
  sendPurchaseReceipt: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/payments/stripe", () => ({
  getStripeCheckoutSession: mocks.getStripeCheckoutSession,
}));

vi.mock("@/lib/analytics/events", () => ({
  logAnalyticsEvent: mocks.logAnalyticsEvent,
}));

vi.mock("@/lib/payments/purchase-receipt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./purchase-receipt")>()),
  sendPurchaseReceipt: mocks.sendPurchaseReceipt,
}));

const [{ confirmStripeBookPurchase }, { processStripeWebhookEvent }] = await Promise.all([
  import("./purchase"),
  import("@/app/api/stripe/webhook/stripeWebhook.handlers"),
]);

type OrderRow = {
  id: string;
  user_id: string;
  book_id: string;
  stripe_session_id: string;
  status: "pending" | "paid" | "failed" | string;
  amount: unknown;
  currency: unknown;
  created_at: string | null;
  chapter_id?: unknown;
};

type QueryCall = {
  operation: "select" | "update";
  fields: string | null;
  filters: Array<["eq" | "in", string, unknown]>;
  payload: Record<string, unknown> | null;
};

function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "order-1",
    user_id: "reader-1",
    book_id: "book-1",
    stripe_session_id: "cs_123",
    status: "pending",
    amount: 1299,
    currency: "SEK",
    created_at: "2026-08-18T09:00:00.000Z",
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_123",
    payment_status: "paid",
    status: "complete",
    metadata: {
      order_id: "order-1",
      user_id: "reader-1",
      book_id: "book-1",
    },
    ...overrides,
  };
}

function makeQueryAwareAdmin(
  initialOrder: OrderRow | null,
  options: {
    finalizerError?: boolean;
    finalizerResult?: boolean;
    orderLookupError?: boolean;
    orderLookupData?: unknown;
    failureWriteError?: boolean;
    beforeFailureWrite?: () => void;
  } = {},
) {
  const state = {
    order: initialOrder ? { ...initialOrder } : null,
    calls: [] as QueryCall[],
    rpcs: [] as Array<{ name: string; args: Record<string, unknown> }>,
    entitlementKeys: new Set<string>(),
  };

  const rowMatches = (filters: QueryCall["filters"]) => {
    if (!state.order) return false;
    return filters.every(([operator, column, expected]) => {
      const actual = state.order?.[column as keyof OrderRow];
      return operator === "eq"
        ? actual === expected
        : Array.isArray(expected) && expected.includes(actual);
    });
  };

  const project = (row: OrderRow, fields: string) => {
    if (fields === "*") return { ...row };
    return Object.fromEntries(
      fields.split(",").map((field) => field.trim()).map((field) => [field, row[field as keyof OrderRow]]),
    );
  };

  const from = vi.fn((table: string) => {
    if (table !== "orders") throw new Error(`Unexpected table ${table}`);

    return {
      select: (fields: string) => {
        const call: QueryCall = { operation: "select", fields, filters: [], payload: null };
        state.calls.push(call);
        const chain = {
          eq(column: string, value: unknown) {
            call.filters.push(["eq", column, value]);
            return chain;
          },
          async maybeSingle() {
            if (options.orderLookupError) {
              return { data: null, error: { code: "57014", message: "synthetic timeout" } };
            }
            if (!state.order || !rowMatches(call.filters)) return { data: null, error: null };
            if (Object.hasOwn(options, "orderLookupData")) {
              return { data: options.orderLookupData, error: null };
            }
            if (fields !== "*" && !Object.hasOwn(state.order, "chapter_id") && fields.includes("chapter_id")) {
              return {
                data: null,
                error: { code: "42703", message: "column orders.chapter_id does not exist" },
              };
            }
            return { data: project(state.order, fields), error: null };
          },
        };
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        const call: QueryCall = { operation: "update", fields: null, filters: [], payload };
        state.calls.push(call);
        let execution: Promise<{
          data: Record<string, unknown>[];
          error: { code: string; message: string } | null;
        }> | null = null;

        const execute = async () => {
          if (!execution) {
            execution = (async () => {
              if (payload.status === "failed") options.beforeFailureWrite?.();
              if (payload.status === "failed" && options.failureWriteError) {
                return {
                  data: [],
                  error: { code: "57014", message: "synthetic timeout" },
                };
              }
              if (!state.order || !rowMatches(call.filters)) return { data: [], error: null };
              state.order = { ...state.order, ...payload } as OrderRow;
              const fields = call.fields ?? "*";
              return { data: [project(state.order, fields)], error: null };
            })();
          }
          return execution;
        };

        const chain = {
          eq(column: string, value: unknown) {
            call.filters.push(["eq", column, value]);
            return chain;
          },
          in(column: string, values: unknown[]) {
            call.filters.push(["in", column, values]);
            return chain;
          },
          select(fields: string) {
            call.fields = fields;
            return chain;
          },
          async maybeSingle() {
            const result = await execute();
            return { data: result.data[0] ?? null, error: result.error };
          },
          then<TResult1 = {
            data: Record<string, unknown>[];
            error: { code: string; message: string } | null;
          }, TResult2 = never>(
            onfulfilled?: ((value: {
              data: Record<string, unknown>[];
              error: { code: string; message: string } | null;
            }) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
          ) {
            return execute().then(onfulfilled, onrejected);
          },
        };
        return chain;
      },
    };
  });

  const client = {
    from,
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      state.rpcs.push({ name, args });
      if (name !== "finalize_order_checkout_session") {
        throw new Error(`Unexpected RPC ${name}`);
      }
      if (options.finalizerError) {
        return { data: null, error: { code: "57014", message: "synthetic timeout" } };
      }
      if (options.finalizerResult === false) return { data: false, error: null };
      if (!state.order || state.order.stripe_session_id !== args.p_stripe_session_id) {
        return { data: false, error: null };
      }
      state.order = { ...state.order, status: "paid" };
      state.entitlementKeys.add(`${state.order.user_id}:${state.order.book_id}:${String(state.order.chapter_id ?? "")}`);
      return { data: true, error: null };
    }),
  };

  return { client, state, options };
}

const confirmArgs = {
  orderId: "order-1",
  sessionId: "cs_123",
  userId: "reader-1",
  bookId: "book-1",
};

describe("purchase confirmation integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logAnalyticsEvent.mockResolvedValue(undefined);
    mocks.sendPurchaseReceipt.mockResolvedValue(undefined);
    mocks.getStripeCheckoutSession.mockResolvedValue(makeSession());
  });

  it("confirms a paid legacy whole-book order through the actual atomic receipt claim", async () => {
    const admin = makeQueryAwareAdmin(makeOrder());
    mocks.createAdminClient.mockReturnValue(admin.client);

    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("paid");

    expect(admin.state.order?.status).toBe("paid");
    expect(admin.state.entitlementKeys.size).toBe(1);
    expect(mocks.sendPurchaseReceipt).toHaveBeenCalledTimes(1);
    expect(admin.state.calls.filter((call) => call.fields).map((call) => call.fields)).toEqual([
      "*",
      "*",
    ]);
  });

  it.each([
    ["whole-book", null],
    ["chapter", "chapter-4"],
  ])("confirms a modern %s order", async (_label, chapterId) => {
    const admin = makeQueryAwareAdmin(makeOrder({ chapter_id: chapterId }));
    mocks.createAdminClient.mockReturnValue(admin.client);

    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("paid");

    expect(mocks.sendPurchaseReceipt).toHaveBeenCalledWith(
      admin.client,
      expect.objectContaining({ chapterId }),
    );
  });

  it("keeps completed, open, and unknown unpaid sessions processing without a claim", async () => {
    for (const status of ["complete", "open", "mystery"]) {
      vi.clearAllMocks();
      const admin = makeQueryAwareAdmin(makeOrder({ chapter_id: null }));
      mocks.createAdminClient.mockReturnValue(admin.client);
      mocks.getStripeCheckoutSession.mockResolvedValue(
        makeSession({ payment_status: "unpaid", status }),
      );

      await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
      expect(admin.state.calls.filter((call) => call.operation === "update")).toHaveLength(0);
      expect(admin.state.rpcs).toHaveLength(0);
      expect(mocks.sendPurchaseReceipt).not.toHaveBeenCalled();
    }

    vi.clearAllMocks();
    const unknownPayment = makeQueryAwareAdmin(makeOrder({ chapter_id: null }));
    mocks.createAdminClient.mockReturnValue(unknownPayment.client);
    mocks.getStripeCheckoutSession.mockResolvedValue(
      makeSession({ payment_status: "unknown", status: "expired" }),
    );
    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
    expect(unknownPayment.state.calls.filter((call) => call.operation === "update")).toHaveLength(0);
  });

  it("keeps provider and order-query uncertainty processing with no side effects", async () => {
    const providerAdmin = makeQueryAwareAdmin(makeOrder({ chapter_id: null }));
    mocks.createAdminClient.mockReturnValue(providerAdmin.client);
    mocks.getStripeCheckoutSession.mockRejectedValueOnce(Object.assign(new Error("provider detail"), { code: "ETIMEDOUT" }));

    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
    expect(providerAdmin.state.calls.filter((call) => call.operation === "update")).toHaveLength(0);

    mocks.getStripeCheckoutSession.mockClear();
    const queryAdmin = makeQueryAwareAdmin(makeOrder({ chapter_id: null }), { orderLookupError: true });
    mocks.createAdminClient.mockReturnValue(queryAdmin.client);
    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
    expect(mocks.getStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it("distinguishes a missing order from an unusable order shape", async () => {
    const missing = makeQueryAwareAdmin(null);
    mocks.createAdminClient.mockReturnValue(missing.client);
    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("failed");
    expect(mocks.getStripeCheckoutSession).not.toHaveBeenCalled();

    const malformedIdentity = makeQueryAwareAdmin(makeOrder(), {
      orderLookupData: makeOrder({ id: "" }),
    });
    mocks.createAdminClient.mockReturnValue(malformedIdentity.client);
    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
    expect(mocks.getStripeCheckoutSession).not.toHaveBeenCalled();

    for (const order of [
      makeOrder({ user_id: " " }),
      makeOrder({ book_id: 42 as unknown as string }),
      makeOrder({ stripe_session_id: "" }),
      makeOrder({ status: "mystery" }),
      makeOrder({ amount: "1299" }),
      makeOrder({ currency: " " }),
    ]) {
      vi.clearAllMocks();
      const malformed = makeQueryAwareAdmin(order);
      mocks.createAdminClient.mockReturnValue(malformed.client);
      await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
      expect(mocks.getStripeCheckoutSession).not.toHaveBeenCalled();
    }
  });

  it.each([false, 0, "", [false]])(
    "keeps a non-null malformed lookup payload processing (%j)",
    async (orderLookupData) => {
      const admin = makeQueryAwareAdmin(makeOrder({ chapter_id: null }), {
        orderLookupData,
      });
      mocks.createAdminClient.mockReturnValue(admin.client);

      await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
      expect(mocks.getStripeCheckoutSession).not.toHaveBeenCalled();
      expect(admin.state.calls.filter((call) => call.operation === "update")).toHaveLength(0);
    },
  );

  it.each([
    ["blank fetched session id", makeSession({ id: "" })],
    ["whitespace fetched session id", makeSession({ id: "   " })],
    ["missing metadata", makeSession({ metadata: undefined })],
    ["null metadata", makeSession({ metadata: null })],
    ["non-record metadata", makeSession({ metadata: "invalid" })],
    ["array metadata", makeSession({ metadata: [] })],
    ["empty metadata", makeSession({ metadata: {} })],
    [
      "blank order metadata",
      makeSession({ metadata: { order_id: "", user_id: "reader-1", book_id: "book-1" } }),
    ],
    [
      "whitespace user metadata",
      makeSession({ metadata: { order_id: "order-1", user_id: "   ", book_id: "book-1" } }),
    ],
    [
      "non-string book metadata",
      makeSession({ metadata: { order_id: "order-1", user_id: "reader-1", book_id: 42 } }),
    ],
  ])("keeps unusable %s processing without side effects", async (_label, session) => {
    const admin = makeQueryAwareAdmin(makeOrder({ chapter_id: null }));
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.getStripeCheckoutSession.mockResolvedValue(session);

    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
    expect(admin.state.calls.filter((call) => call.operation === "update")).toHaveLength(0);
    expect(admin.state.rpcs).toHaveLength(0);
    expect(mocks.sendPurchaseReceipt).not.toHaveBeenCalled();
  });

  it.each([
    ["stored session", makeOrder({ chapter_id: null, stripe_session_id: "cs_other" }), makeSession()],
    ["returned session", makeOrder({ chapter_id: null }), makeSession({ id: "cs_other" })],
    ["whitespace-padded returned session", makeOrder({ chapter_id: null }), makeSession({ id: " cs_123 " })],
    [
      "required metadata",
      makeOrder({ chapter_id: null }),
      makeSession({ metadata: { order_id: "order-other", user_id: "reader-1", book_id: "book-1" } }),
    ],
    [
      "whitespace-padded required metadata",
      makeOrder({ chapter_id: null }),
      makeSession({ metadata: { order_id: " order-1 ", user_id: "reader-1", book_id: "book-1" } }),
    ],
  ])("rejects a wrong %s identity without changing the order", async (_label, order, session) => {
    const admin = makeQueryAwareAdmin(order);
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.getStripeCheckoutSession.mockResolvedValue(session);

    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("failed");
    expect(admin.state.calls.filter((call) => call.operation === "update")).toHaveLength(0);
    expect(admin.state.rpcs).toHaveLength(0);
  });

  it.each([
    ["amount", makeSession({ amount_total: 1499 })],
    ["malformed amount", makeSession({ amount_total: "1299" })],
    ["currency", makeSession({ currency: "usd" })],
    ["malformed currency", makeSession({ currency: null })],
    ["payment type", makeSession({ metadata: { ...makeSession().metadata, payment_type: "donation" } })],
    ["chapter", makeSession({ metadata: { ...makeSession().metadata, chapter_id: "chapter-other" } })],
  ])("treats conflicting present %s scope as processing", async (_label, session) => {
    const admin = makeQueryAwareAdmin(makeOrder({ chapter_id: "chapter-4" }));
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.getStripeCheckoutSession.mockResolvedValue(session);

    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
    expect(admin.state.calls.filter((call) => call.operation === "update")).toHaveLength(0);
    expect(admin.state.rpcs).toHaveLength(0);
  });

  it("rejects a malformed present chapter shape before Stripe verification", async () => {
    const admin = makeQueryAwareAdmin(makeOrder({ chapter_id: 42 }));
    mocks.createAdminClient.mockReturnValue(admin.client);

    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
    expect(mocks.getStripeCheckoutSession).not.toHaveBeenCalled();
    expect(admin.state.calls.filter((call) => call.operation === "update")).toHaveLength(0);
  });

  it("keeps the paid claim on finalizer failure and heals on retry without a duplicate receipt", async () => {
    const admin = makeQueryAwareAdmin(makeOrder({ chapter_id: null }), { finalizerError: true });
    mocks.createAdminClient.mockReturnValue(admin.client);

    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
    expect(admin.state.order?.status).toBe("paid");
    expect(admin.state.entitlementKeys.size).toBe(0);
    expect(mocks.sendPurchaseReceipt).not.toHaveBeenCalled();

    admin.options.finalizerError = false;
    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("paid");
    expect(admin.state.entitlementKeys.size).toBe(1);
    expect(mocks.sendPurchaseReceipt).not.toHaveBeenCalled();
  });

  it("keeps confirmed access successful when analytics fails", async () => {
    const admin = makeQueryAwareAdmin(makeOrder({ chapter_id: null }));
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.logAnalyticsEvent.mockRejectedValueOnce(Object.assign(new Error("analytics detail"), { code: "ETIMEDOUT" }));

    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("paid");
    expect(admin.state.entitlementKeys.size).toBe(1);
  });

  it("allows only one receipt owner across webhook delivery and landing-page replay", async () => {
    const admin = makeQueryAwareAdmin(makeOrder({ chapter_id: null }));
    mocks.createAdminClient.mockReturnValue(admin.client);
    const paidSession = makeSession();

    await expect(
      processStripeWebhookEvent(admin.client as never, "checkout.session.completed", "evt-1", paidSession),
    ).resolves.toEqual({ received: true, processed: true });
    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("paid");

    expect(mocks.sendPurchaseReceipt).toHaveBeenCalledTimes(1);
    expect(admin.state.entitlementKeys.size).toBe(1);
  });

  it("conditionally fails only an exact bound expired unpaid pending order", async () => {
    const admin = makeQueryAwareAdmin(makeOrder({ chapter_id: null }));
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.getStripeCheckoutSession.mockResolvedValue(
      makeSession({ payment_status: "unpaid", status: "expired" }),
    );

    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("failed");

    const write = admin.state.calls.find((call) => call.payload?.status === "failed");
    expect(write?.filters).toEqual([
      ["eq", "id", "order-1"],
      ["eq", "user_id", "reader-1"],
      ["eq", "stripe_session_id", "cs_123"],
      ["eq", "status", "pending"],
    ]);
    expect(write?.fields).toBe("id");
  });

  it("reports processing when a raced paid row defeats the expired-session write", async () => {
    const admin = makeQueryAwareAdmin(makeOrder({ chapter_id: null }), {
      beforeFailureWrite: () => {
        if (admin.state.order) admin.state.order.status = "paid";
      },
    });
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.getStripeCheckoutSession.mockResolvedValue(
      makeSession({ payment_status: "unpaid", status: "expired" }),
    );

    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
    expect(admin.state.order?.status).toBe("paid");
  });

  it("reports processing when the expired-session write is uncertain", async () => {
    const admin = makeQueryAwareAdmin(makeOrder({ chapter_id: null }), {
      failureWriteError: true,
    });
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.getStripeCheckoutSession.mockResolvedValue(
      makeSession({ payment_status: "unpaid", status: "expired" }),
    );

    await expect(confirmStripeBookPurchase(confirmArgs)).resolves.toBe("processing");
    expect(admin.state.order?.status).toBe("pending");
  });
});
