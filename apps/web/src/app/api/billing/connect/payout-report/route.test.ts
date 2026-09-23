import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), account: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/payments/stripe-connect", () => ({ getPayoutAccount: mocks.account }));
vi.mock("@/lib/payments/stripe-payouts", () => ({ getConnectedPayoutSnapshot: mocks.snapshot, payoutReportCsv: () => "report" }));
const { GET } = await import("./route");

describe("payout report authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "author-1" }, response: null });
    mocks.account.mockResolvedValue({ stripe_account_id: "acct_owner" });
    mocks.snapshot.mockResolvedValue({});
  });

  it.each([401, 403])("blocks unauthorized access (%s)", async (status) => {
    mocks.auth.mockResolvedValue({ user: null, response: new Response(null, { status }) });
    expect((await GET()).status).toBe(status);
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("uses the verified author's mapping and disables report caching", async () => {
    const response = await Reflect.apply(GET, null, [new Request("https://example.invalid/api/billing/connect/payout-report?accountId=acct_attacker&userId=attacker")]);
    expect(mocks.account).toHaveBeenCalledWith({}, "author-1");
    expect(mocks.snapshot).toHaveBeenCalledWith("acct_owner");
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
  });

  it("returns a distinct not-connected error without calling Stripe", async () => {
    mocks.account.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(409);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("returns a service error rather than an empty report when Stripe fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.snapshot.mockRejectedValue(new Error("Stripe unavailable"));
    expect((await GET()).status).toBe(503);
    expect(log).toHaveBeenCalledWith("[author payouts] report failed", expect.objectContaining({ userId: "author-1" }));
    log.mockRestore();
  });
});
