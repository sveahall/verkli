import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), account: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRole: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/payments/stripe-connect", () => ({ getPayoutAccount: mocks.account }));
vi.mock("@/lib/payments/stripe-payouts", () => ({ getConnectedPayoutSnapshot: mocks.snapshot, formatPayoutAmount: (amount: number, currency: string) => `${amount / 100} ${currency}` }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => "en" }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
const { default: Page } = await import("./page");

describe("payout page states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ ok: true, user: { id: "author-1" } });
    mocks.account.mockResolvedValue({ stripe_account_id: "acct_author", payouts_enabled: true, charges_enabled: true });
    mocks.snapshot.mockResolvedValue({ available: [{ amount: 12345, currency: "sek" }], pending: [], payouts: [], hasMore: false, livemode: false });
  });
  it("shows real connected funds, empty history, test-mode label and CSV button", async () => {
    const html = renderToStaticMarkup(await Page({}));
    expect(html).toContain("123.45 sek");
    expect(html).toContain("historyEmpty");
    expect(html).toContain("testMode");
    expect(html).toContain("downloadReport");
    expect(html).not.toContain("balanceComingSoon");
  });
  it("shows unavailable and retry instead of zero or onboarding when the lookup fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.account.mockRejectedValue(new Error("Database unavailable"));
    const html = renderToStaticMarkup(await Page({}));
    expect(html).toContain("loadError");
    expect(html).toContain("retry");
    expect(html).not.toContain("startOnboarding");
    log.mockRestore();
  });
  it("does not render funds or CSV when Stripe is unavailable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.snapshot.mockRejectedValue(new Error("Stripe unavailable"));
    const html = renderToStaticMarkup(await Page({}));
    expect(html).toContain("loadError");
    expect(html).not.toContain("downloadReport");
    log.mockRestore();
  });
  it("renders payout status and bounded history in separate currencies", async () => {
    mocks.snapshot.mockResolvedValue({ available: [{ amount: 0, currency: "sek" }, { amount: 1000, currency: "eur" }], pending: [{ amount: 200, currency: "sek" }], payouts: [{ id: "po_failed", amount: 3200, currency: "sek", status: "failed", created: 1700000000, arrival_date: 1700200000 }], hasMore: true, livemode: true });
    const html = renderToStaticMarkup(await Page({}));
    expect(html).toContain("0 sek");
    expect(html).toContain("10 eur");
    expect(html).toContain("payoutStatus_failed");
    expect(html).toContain("moreHistory");
    expect(html).not.toContain("testMode");
  });
  it("labels an unrecognized Stripe payout status without breaking the page", async () => {
    mocks.snapshot.mockResolvedValue({ available: [], pending: [], payouts: [{ id: "po_new", amount: 100, currency: "sek", status: "future_status", created: 1700000000, arrival_date: 1700200000 }], hasMore: false, livemode: true });
    const html = renderToStaticMarkup(await Page({}));
    expect(html).toContain("payoutStatus_unknown");
  });
  it.each([false, true])("shows onboarding safely (existing account: %s)", async (existing) => {
    mocks.account.mockResolvedValue(existing ? { stripe_account_id: "acct_author", payouts_enabled: false } : null);
    const html = renderToStaticMarkup(await Page({}));
    expect(html).toContain(existing ? "continueOnboarding" : "startOnboarding");
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(html).not.toContain("platformFee");
  });
  it("sends signed-out users to author signin before any account lookup", async () => {
    mocks.auth.mockResolvedValue({ ok: false, status: 401 });
    await expect(Page({})).rejects.toThrow("/author/signin");
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it("ignores unrecognized status values including prototype property names", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ status: "constructor" }) }));
    expect(html).not.toContain("constructor");
  });
  it("blocks unapproved users before the admin lookup", async () => {
    mocks.auth.mockResolvedValue({ ok: false, status: 403 });
    await expect(Page({})).rejects.toThrow("/reader/home");
    expect(mocks.account).not.toHaveBeenCalled();
  });
});
