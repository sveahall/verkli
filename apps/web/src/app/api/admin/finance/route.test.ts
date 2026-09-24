import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminRoleForApi: mocks.auth }));
vi.mock("@/lib/payments/stripe-balance-report", () => ({ getStripeBalanceReport: mocks.report }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "admin" }, response: null }); });
it.each([401, 403])("rejects %i before any provider access", async status => {
  mocks.auth.mockResolvedValue({ response: new Response("denied", { status }) });
  const response = await GET(new Request("http://localhost/api/admin/finance?month=2026-09"));
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(mocks.report).not.toHaveBeenCalled();
});
it("returns the authorized report without caching", async () => {
  mocks.report.mockResolvedValue({ mode: "test", transactions: [] });
  const response = await GET(new Request("http://localhost/api/admin/finance?month=2026-09"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ mode: "test", transactions: [] });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("rejects a missing month and arbitrary scope parameters", async () => {
  for (const query of ["", "month=2026-09&account=acct_other", "month=2026-09&mode=live"]) {
    expect((await GET(new Request(`http://localhost/api/admin/finance?${query}`))).status).toBe(400);
  }
  expect(mocks.report).not.toHaveBeenCalled();
});
it("does not expose provider error data or replace failure with zero", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.report.mockRejectedValue(new Error("secret customer data"));
  const response = await GET(new Request("http://localhost/api/admin/finance?month=2026-09"));
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("secret");
  expect(log).toHaveBeenCalledWith("[admin finance] provider activity read failed");
  log.mockRestore();
});
