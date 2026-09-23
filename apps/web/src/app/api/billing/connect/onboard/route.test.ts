import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), check: vi.fn(), account: vi.fn(), link: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.check }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.audit, auditMetadataFromRequest: () => ({}) }));
vi.mock("@/lib/request-url", () => ({ getRequestBaseUrl: () => "http://localhost:3000" }));
vi.mock("@/lib/payments/stripe-connect", () => ({
  createOnboardingLink: mocks.link, getOrCreateConnectAccount: mocks.account,
}));
const { POST } = await import("./route");

function request(accept?: string) {
  return new Request("http://localhost:3000/api/billing/connect/onboard", {
    method: "POST",
    headers: accept ? { Accept: accept } : {},
  });
}

describe("Stripe onboarding response negotiation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "author-1", email: "author@example.com" }, role: "author", response: null });
    mocks.check.mockResolvedValue({ allowed: true });
    mocks.account.mockResolvedValue({ stripe_account_id: "acct_author", country: "SE" });
    mocks.link.mockResolvedValue("https://connect.stripe.com/setup/example");
    mocks.audit.mockResolvedValue(undefined);
  });

  it("redirects the browser form to Stripe with GET semantics (303)", async () => {
    const response = await POST(request("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://connect.stripe.com/setup/example");
  });

  it.each([undefined, "application/json", "*/*"])("preserves JSON for API callers accepting %s", async (accept) => {
    const response = await POST(request(accept));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://connect.stripe.com/setup/example", accountId: "acct_author" });
  });

  it("returns HTML clients to the payout error state when Stripe fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.link.mockRejectedValue(new Error("Stripe unavailable"));
    const response = await POST(request("text/html"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/author/billing/payouts?status=onboarding_failed");
    log.mockRestore();
  });

  it("preserves API failure status when Stripe fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.link.mockRejectedValue(new Error("Stripe unavailable"));
    expect((await POST(request("application/json"))).status).toBe(500);
    log.mockRestore();
  });

  it("still refuses unauthorized requests before account creation", async () => {
    mocks.auth.mockResolvedValue({ user: null, response: new Response(null, { status: 403 }) });
    expect((await POST(request("text/html"))).status).toBe(403);
    expect(mocks.account).not.toHaveBeenCalled();
  });
});
