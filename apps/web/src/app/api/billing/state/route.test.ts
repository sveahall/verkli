import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockGetActiveRoleFromRequest = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

vi.mock("@/lib/active-role", () => ({
  getActiveRoleFromRequest: (...args: unknown[]) =>
    mockGetActiveRoleFromRequest(...args),
}));

vi.mock("@/lib/billing/server", () => ({
  getBillingStateForUser: vi.fn(),
}));

const { getBillingStateForUser } = await import("@/lib/billing/server");
const { GET } = await import("./route");

describe("GET /api/billing/state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
  });

  it("returns 403 when active_role cookie is missing", async () => {
    mockGetActiveRoleFromRequest.mockReturnValue(null);

    const req = new Request("http://localhost/api/billing/state");
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(mockGetActiveRoleFromRequest).toHaveBeenCalledWith(req);
    expect(getBillingStateForUser).not.toHaveBeenCalled();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockGetActiveRoleFromRequest.mockReturnValue("reader");

    const req = new Request("http://localhost/api/billing/state");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns role-scoped state for reader: only Plus (isProActive false)", async () => {
    mockGetActiveRoleFromRequest.mockReturnValue("reader");
    vi.mocked(getBillingStateForUser).mockResolvedValue({
      ok: true,
      row: null,
      state: {
        plan: "plus",
        status: "active",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        isPlusActive: true,
        isProActive: false,
        plusCancelAtPeriodEnd: false,
        plusPeriodEnd: null,
      },
    });

    const req = new Request("http://localhost/api/billing/state", {
      headers: { cookie: "active_role=reader" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getBillingStateForUser).toHaveBeenCalledWith("user-1", "reader");
    expect(body.isProActive).toBe(false);
    expect(body.isPlusActive).toBe(true);
  });

  it("returns role-scoped state for author: can have Pro", async () => {
    mockGetActiveRoleFromRequest.mockReturnValue("author");
    vi.mocked(getBillingStateForUser).mockResolvedValue({
      ok: true,
      row: null,
      state: {
        plan: "pro",
        status: "active",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        isPlusActive: true,
        isProActive: true,
        plusCancelAtPeriodEnd: false,
        plusPeriodEnd: null,
      },
    });

    const req = new Request("http://localhost/api/billing/state", {
      headers: { cookie: "active_role=author" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getBillingStateForUser).toHaveBeenCalledWith("user-1", "author");
    expect(body.isProActive).toBe(true);
  });

  it("returns Cache-Control no-store so state is never cached", async () => {
    mockGetActiveRoleFromRequest.mockReturnValue("reader");
    vi.mocked(getBillingStateForUser).mockResolvedValue({
      ok: true,
      row: null,
      state: {
        plan: null,
        status: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        isPlusActive: false,
        isProActive: false,
        plusCancelAtPeriodEnd: false,
        plusPeriodEnd: null,
      },
    });

    const req = new Request("http://localhost/api/billing/state", {
      headers: { cookie: "active_role=reader" },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("Pragma")).toBe("no-cache");
  });

  it("returns role-scoped state: reader gets Plus, author gets Pro (two billing_accounts rows)", async () => {
    vi.mocked(getBillingStateForUser).mockImplementation(async (_userId, role) => {
      if (role === "reader") {
        return {
          ok: true,
          row: null,
          state: {
            plan: "plus",
            status: "active",
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_plus",
            isPlusActive: true,
            isProActive: false,
            plusCancelAtPeriodEnd: false,
            plusPeriodEnd: null,
          },
        };
      }
      return {
        ok: true,
        row: null,
        state: {
          plan: "pro",
          status: "active",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_pro",
          isPlusActive: true,
          isProActive: true,
          plusCancelAtPeriodEnd: false,
          plusPeriodEnd: null,
        },
      };
    });

    const readerReq = new Request("http://localhost/api/billing/state", {
      headers: { cookie: "active_role=reader" },
    });
    mockGetActiveRoleFromRequest.mockReturnValue("reader");
    const readerRes = await GET(readerReq);
    const readerBody = await readerRes.json();
    expect(readerRes.status).toBe(200);
    expect(getBillingStateForUser).toHaveBeenLastCalledWith("user-1", "reader");
    expect(readerBody.plan).toBe("plus");
    expect(readerBody.isProActive).toBe(false);

    const authorReq = new Request("http://localhost/api/billing/state", {
      headers: { cookie: "active_role=author" },
    });
    mockGetActiveRoleFromRequest.mockReturnValue("author");
    const authorRes = await GET(authorReq);
    const authorBody = await authorRes.json();
    expect(authorRes.status).toBe(200);
    expect(getBillingStateForUser).toHaveBeenLastCalledWith("user-1", "author");
    expect(authorBody.plan).toBe("pro");
    expect(authorBody.isProActive).toBe(true);
  });
});
