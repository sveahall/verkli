import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), balance: vi.fn(), list: vi.fn(), constructor: vi.fn() }));
vi.mock("stripe", () => ({ default: class { constructor(...args: unknown[]) { mocks.constructor(...args); } accounts = { retrieve: mocks.account }; balance = { retrieve: mocks.balance }; balanceTransactions = { list: mocks.list }; } }));
import { getStripeBalanceReport } from "./stripe-balance-report";
const row = (id: string, amount = 100, fee = 3, currency = "sek") => ({ id, object: "balance_transaction", amount, fee, net: amount - fee, currency, created: 1788307200, available_on: 1788393600, type: "charge", reporting_category: "charge", status: "available", source: "ch_sample", description: "private customer data" });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  mocks.account.mockResolvedValue({ id: "acct_fixture", email: "private@example.com" });
  mocks.balance.mockResolvedValue({ livemode: false });
  mocks.list.mockResolvedValue({ data: [], has_more: false });
});
describe("read-only Stripe account activity", () => {
  it("uses UTC boundaries and projects only financial fields", async () => {
    mocks.list.mockResolvedValue({ data: [row("txn_1")], has_more: false });
    const report = await getStripeBalanceReport("2026-09", new Date("2026-10-02T00:00:00Z"));
    expect(mocks.list).toHaveBeenCalledWith({ limit: 100, created: { gte: 1788220800, lt: 1790812800 } });
    expect(report).toMatchObject({ accountId: "acct_fixture", mode: "test", allPagesRead: true, currencies: [{ currency: "SEK", amountMinor: "100", feeMinor: "3", netMinor: "97" }] });
    expect(JSON.stringify(report)).not.toMatch(/private|example.com|description|ch_sample/);
  });
  it("paginates and retains signed refunds and reversals exactly by currency", async () => {
    mocks.list.mockResolvedValueOnce({ data: [row("txn_1", Number.MAX_SAFE_INTEGER, 0), row("txn_2", -2000, -30)], has_more: true })
      .mockResolvedValueOnce({ data: [row("txn_3", 2000, 0), row("txn_4", 50, 1, "eur")], has_more: false });
    const report = await getStripeBalanceReport("2026-09", new Date("2026-10-02"));
    expect(mocks.list.mock.calls[1][0].starting_after).toBe("txn_2");
    expect(report.currencies.find(x => x.currency === "SEK")).toMatchObject({ amountMinor: "9007199254740991", feeMinor: "-30", netMinor: "9007199254741021" });
    expect(report.currencies).toHaveLength(2);
  });
  it("labels a bounded partial read without declaring it complete", async () => {
    for (let i = 0; i < 5; i++) mocks.list.mockResolvedValueOnce({ data: [row(`txn_${i}`)], has_more: true });
    expect(await getStripeBalanceReport("2026-09", new Date("2026-10-02"))).toMatchObject({ allPagesRead: false, pagesRead: 5 });
    expect(mocks.list).toHaveBeenCalledTimes(5);
  });
  it("deduplicates exact repeated IDs but rejects conflicts", async () => {
    mocks.list.mockResolvedValue({ data: [row("txn_1"), row("txn_1")], has_more: false });
    expect((await getStripeBalanceReport("2026-09", new Date("2026-10-02"))).transactions).toHaveLength(1);
    mocks.list.mockResolvedValue({ data: [row("txn_1"), row("txn_1", 200)], has_more: false });
    await expect(getStripeBalanceReport("2026-09", new Date("2026-10-02"))).rejects.toThrow();
  });
  it.each([
    { amount: Number.MAX_SAFE_INTEGER + 1 }, { fee: 0.5 }, { net: 0 },
    { currency: "bad-currency" }, { created: 1790812800 }, { source: {} },
  ])("rejects invalid provider amounts or coverage %j", async patch => {
    mocks.list.mockResolvedValue({ data: [{ ...row("txn_1"), ...patch }], has_more: false });
    await expect(getStripeBalanceReport("2026-09", new Date("2026-10-02"))).rejects.toThrow();
  });
  it("never turns provider failures into an empty report", async () => {
    mocks.list.mockRejectedValue(new Error("provider unavailable"));
    await expect(getStripeBalanceReport("2026-09", new Date("2026-10-02"))).rejects.toThrow();
  });
  it("rejects mode mismatches before reading transactions", async () => {
    mocks.balance.mockResolvedValue({ livemode: true });
    await expect(getStripeBalanceReport("2026-09", new Date("2026-10-02"))).rejects.toThrow();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("flags missing source linkage and never invents a balance checkpoint", async () => {
    mocks.list.mockResolvedValue({ data: [{ ...row("txn_1"), source: null }], has_more: false });
    const report = await getStripeBalanceReport("2026-09", new Date("2026-10-02"));
    expect(report.missingSourceCount).toBe(1);
    expect(report).not.toHaveProperty("openingBalance");
  });
  it("caps this month's query at read start and rejects malformed months before provider calls", async () => {
    await getStripeBalanceReport("2026-09", new Date("2026-09-15T00:00:00Z"));
    expect(mocks.list.mock.calls[0][0].created.lt).toBe(1789430400);
    mocks.constructor.mockClear();
    for (const month of ["2026-13", "2026-09junk", "2026-11"]) await expect(getStripeBalanceReport(month, new Date("2026-10-02"))).rejects.toThrow();
    expect(mocks.constructor).not.toHaveBeenCalled();
  });
  it("rejects non-advancing pagination", async () => {
    mocks.list.mockResolvedValue({ data: [row("txn_same")], has_more: true });
    await expect(getStripeBalanceReport("2026-09", new Date("2026-10-02"))).rejects.toThrow();
  });
});
