import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), account: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRole: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "author-1" } } }) } }) }));
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
  it("shows real connected funds, empty history, test-mode label and CSV link", async () => {
    const html = renderToStaticMarkup(await Page({}));
    expect(html).toContain("123.45 sek");
    expect(html).toContain("historyEmpty");
    expect(html).toContain("testMode");
    expect(html).toContain("/api/billing/connect/payout-report");
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
    expect(html).not.toContain("/api/billing/connect/payout-report");
    log.mockRestore();
  });
  it("blocks unapproved users before the admin lookup", async () => {
    mocks.auth.mockResolvedValue({ ok: false, status: 403 });
    await expect(Page({})).rejects.toThrow("/reader/home");
    expect(mocks.account).not.toHaveBeenCalled();
  });
});
