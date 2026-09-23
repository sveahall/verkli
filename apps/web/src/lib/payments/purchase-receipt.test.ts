import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

const { claimPaidOrderForReceipt, sendPurchaseReceipt } = await import(
  "./purchase-receipt"
);

type OrderRow = {
  id: string;
  user_id: string;
  book_id: string;
  chapter_id: string | null;
  amount: number | string | null;
  currency: string;
  created_at: string | null;
};

type ClaimOutcome = {
  /** Row returned by the conditional UPDATE, or null when it matched nothing. */
  row: OrderRow | null;
  error?: { code: string; message: string };
};

/**
 * Fake of the one query the claim performs:
 *   update({status:"paid"}).eq(stripe_session_id).in(status,[…]).select().maybeSingle()
 *
 * The real guarantee comes from Postgres serialising concurrent updates of a
 * row; what we can assert here is that the query is shaped so that guarantee
 * applies — the status predicate must be part of the UPDATE, not a prior read.
 */
function makeClaimClient(outcome: ClaimOutcome) {
  const calls = {
    updatePayloads: [] as Record<string, unknown>[],
    eqFilters: [] as Array<[string, unknown]>,
    inFilters: [] as Array<[string, unknown[]]>,
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table !== "orders") throw new Error(`Unexpected table ${table}`);
      return {
        update: vi.fn((payload: Record<string, unknown>) => {
          calls.updatePayloads.push(payload);
          return {
            eq: vi.fn((column: string, value: unknown) => {
              calls.eqFilters.push([column, value]);
              return {
                in: vi.fn((column2: string, values: unknown[]) => {
                  calls.inFilters.push([column2, values]);
                  return {
                    select: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({
                        data: outcome.row,
                        error: outcome.error ?? null,
                      })),
                    })),
                  };
                }),
              };
            }),
          };
        }),
      };
    }),
  };

  return { client, calls };
}

const CLAIM = {
  orderId: "order-1",
  userId: "reader-1",
  bookId: "book-1",
  chapterId: null,
  amountMinor: 12900,
  currency: "SEK",
  stripeSessionId: "cs_test_1",
  createdAt: "2026-08-18T09:00:00.000Z",
};

function makeSendClient(options?: {
  bookTitle?: string | null;
  authorDisplayName?: string | null;
  buyerEmail?: string | null;
  chapterTitle?: string | null;
}) {
  const bookTitle = options?.bookTitle ?? "The Salt Road";
  const authorDisplayName =
    options?.authorDisplayName === undefined ? "Johan Ek" : options.authorDisplayName;
  const buyerEmail =
    options?.buyerEmail === undefined ? "buyer@example.com" : options.buyerEmail;
  const chapterTitle = options?.chapterTitle ?? null;

  const singleTableSelect = (data: unknown) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data, error: null })),
      })),
    })),
  });

  return {
    from: vi.fn((table: string) => {
      switch (table) {
        case "books":
          return singleTableSelect({ title: bookTitle, author_id: "author-1" });
        case "profiles":
          return singleTableSelect({
            display_name: authorDisplayName,
            username: null,
          });
        case "chapters":
          return singleTableSelect(chapterTitle ? { title: chapterTitle } : null);
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    }),
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: buyerEmail ? { email: buyerEmail } : null },
        })),
      },
    },
  };
}

describe("claimPaidOrderForReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the order when this caller wins the pending→paid transition", async () => {
    const { client, calls } = makeClaimClient({
      row: {
        id: "order-1",
        user_id: "reader-1",
        book_id: "book-1",
        chapter_id: null,
        amount: 12900,
        currency: "SEK",
        created_at: "2026-08-18T09:00:00.000Z",
      },
    });

    const claim = await claimPaidOrderForReceipt(
      client as never,
      "cs_test_1",
    );

    expect(claim).toEqual(CLAIM);
    // The status predicate must live on the UPDATE — that is what makes it a
    // claim rather than a read-then-write race.
    expect(calls.updatePayloads).toEqual([{ status: "paid" }]);
    expect(calls.eqFilters).toEqual([["stripe_session_id", "cs_test_1"]]);
    expect(calls.inFilters).toEqual([["status", ["pending", "failed"]]]);
  });

  it("returns null when the order was already paid, so no second receipt goes out", async () => {
    // Postgres re-checks the WHERE clause after the winner commits, so the
    // loser's UPDATE matches zero rows.
    const { client } = makeClaimClient({ row: null });

    expect(await claimPaidOrderForReceipt(client as never, "cs_test_1")).toBeNull();
  });

  it("claims a failed order too, so a late settlement still gets its receipt", async () => {
    const { client, calls } = makeClaimClient({
      row: {
        id: "order-9",
        user_id: "reader-9",
        book_id: "book-9",
        chapter_id: "chapter-3",
        amount: 4900,
        currency: "sek",
        created_at: null,
      },
    });

    const claim = await claimPaidOrderForReceipt(client as never, "cs_late");

    expect(calls.inFilters[0][1]).toContain("failed");
    expect(claim).toMatchObject({
      orderId: "order-9",
      chapterId: "chapter-3",
      amountMinor: 4900,
      currency: "sek",
      createdAt: null,
    });
  });

  it("returns null, and does not throw, when the claim query errors", async () => {
    // A receipt must never be the reason a paid purchase fails.
    const { client } = makeClaimClient({
      row: null,
      error: { code: "57014", message: "statement timeout" },
    });

    expect(await claimPaidOrderForReceipt(client as never, "cs_test_1")).toBeNull();
  });

  it("returns null for a blank session id without querying", async () => {
    const { client } = makeClaimClient({ row: null });

    expect(await claimPaidOrderForReceipt(client as never, "   ")).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns null when the claimed row has no usable amount", async () => {
    const { client } = makeClaimClient({
      row: {
        id: "order-1",
        user_id: "reader-1",
        book_id: "book-1",
        chapter_id: null,
        amount: null,
        currency: "SEK",
        created_at: null,
      },
    });

    expect(await claimPaidOrderForReceipt(client as never, "cs_test_1")).toBeNull();
  });
});

describe("sendPurchaseReceipt", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM_EMAIL;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ error: null });
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "Verkli <noreply@verkli.com>";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFrom;
  });

  it("emails the buyer a receipt naming the book and the amount", async () => {
    const client = makeSendClient();

    await sendPurchaseReceipt(client as never, CLAIM);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const payload = mocks.send.mock.calls[0][0];
    expect(payload.to).toBe("buyer@example.com");
    expect(payload.from).toBe("Verkli <noreply@verkli.com>");
    expect(payload.subject).toContain("The Salt Road");
    expect(payload.html).toContain("The Salt Road");
    expect(payload.html).toContain("Johan Ek");
    expect(payload.html).toContain("order-1");
    expect(payload.text).toContain("The Salt Road");
    expect(payload.text).toContain("Thank you for your purchase.");
  });

  it("names the chapter for a single-chapter purchase", async () => {
    const client = makeSendClient({ chapterTitle: "Chapter 4 — The Crossing" });

    await sendPurchaseReceipt(client as never, { ...CLAIM, chapterId: "chapter-4" });

    const payload = mocks.send.mock.calls[0][0];
    expect(payload.html).toContain("Chapter 4");
    expect(payload.text).toContain("Chapter 4");
  });

  it("does not send when Resend is unconfigured", async () => {
    delete process.env.RESEND_API_KEY;
    const client = makeSendClient();

    await sendPurchaseReceipt(client as never, CLAIM);

    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not send when the buyer has no email on file", async () => {
    const client = makeSendClient({ buyerEmail: null });

    await sendPurchaseReceipt(client as never, CLAIM);

    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("swallows a provider outage instead of failing the purchase", async () => {
    mocks.send.mockRejectedValue(new Error("resend is down"));
    const client = makeSendClient();

    await expect(sendPurchaseReceipt(client as never, CLAIM)).resolves.toBeUndefined();
  });

  it("swallows a provider-reported error too", async () => {
    mocks.send.mockResolvedValue({ error: { message: "domain not verified" } });
    const client = makeSendClient();

    await expect(sendPurchaseReceipt(client as never, CLAIM)).resolves.toBeUndefined();
  });

  it("still sends when the author profile cannot be resolved", async () => {
    const client = makeSendClient({ authorDisplayName: null });

    await sendPurchaseReceipt(client as never, CLAIM);

    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
