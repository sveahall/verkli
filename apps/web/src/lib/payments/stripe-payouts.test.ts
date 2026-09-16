import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ balance: vi.fn(), payouts: vi.fn() }));
vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    balance: { retrieve: mocks.balance },
    payouts: { list: mocks.payouts },
  })),
}));

const { getConnectedPayoutSnapshot, formatPayoutAmount, payoutReportCsv } = await import("./stripe-payouts");

describe("connected payout visibility", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    mocks.balance.mockResolvedValue({ available: [{ amount: 12345, currency: "sek" }, { amount: 900, currency: "usd" }], pending: [{ amount: 800, currency: "sek" }], livemode: false });
    mocks.payouts.mockResolvedValue({ data: [{ id: "po_123", amount: 5000, currency: "sek", status: "paid", created: 1700000000, arrival_date: 1700200000 }], has_more: true });
  });

  it("reads both resources only in the connected account and keeps currencies separate", async () => {
    const result = await getConnectedPayoutSnapshot("acct_author");
    expect(mocks.balance).toHaveBeenCalledWith({}, { stripeAccount: "acct_author" });
    expect(mocks.payouts).toHaveBeenCalledWith({ limit: 100 }, { stripeAccount: "acct_author" });
    expect(result.available).toEqual([{ amount: 12345, currency: "sek" }, { amount: 900, currency: "usd" }]);
    expect(result.hasMore).toBe(true);
    expect(result.livemode).toBe(false);
  });

  it("refuses a missing account instead of falling back to the platform balance", async () => {
    await expect(getConnectedPayoutSnapshot("")).rejects.toThrow("connected account");
    expect(mocks.balance).not.toHaveBeenCalled();
  });

  it("propagates Stripe outages instead of returning a zero balance", async () => {
    mocks.balance.mockRejectedValue(new Error("Stripe unavailable"));
    await expect(getConnectedPayoutSnapshot("acct_author")).rejects.toThrow("Stripe unavailable");
  });

  it("refuses missing configuration without contacting Stripe", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    await expect(getConnectedPayoutSnapshot("acct_author")).rejects.toThrow("Missing STRIPE_SECRET_KEY");
    expect(mocks.balance).not.toHaveBeenCalled();
    expect(mocks.payouts).not.toHaveBeenCalled();
  });

  it("fails the snapshot if the payout history request fails", async () => {
    mocks.payouts.mockRejectedValue(new Error("History unavailable"));
    await expect(getConnectedPayoutSnapshot("acct_author")).rejects.toThrow("History unavailable");
  });

  it("exports an honest empty report with column headers", async () => {
    mocks.payouts.mockResolvedValue({ data: [], has_more: false });
    const csv = payoutReportCsv(await getConnectedPayoutSnapshot("acct_author"));
    expect(csv).toContain("has_more,false");
    expect(csv).toContain("livemode,false");
    expect(csv).toContain("payout_id,created_utc,expected_arrival_utc,amount_minor,currency,status");
    expect(csv).not.toContain("po_123");
  });

  it.each([
    [12345, "sek", "123.45"], [123, "jpy", "123"], [12300, "isk", "123"],
    [12300, "ugx", "123"], [12300, "huf", "123.00"], [12345, "bhd", "12.345"],
  ])("formats Stripe minor units for %s %s", (amount, currency, expected) => {
    expect(formatPayoutAmount(amount, currency, "en")).toContain(expected);
  });

  it("exports status, currency and coverage without presenting recent payouts as lifetime royalty", async () => {
    const csv = payoutReportCsv(await getConnectedPayoutSnapshot("acct_author"));
    expect(csv).toContain("amount_minor,currency,status");
    expect(csv).toContain("5000,SEK,paid");
    expect(csv).toContain("latest_100");
    expect(csv).toContain("has_more,true");
  });
});
