import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ client: vi.fn(), insert: vi.fn(), update: vi.fn(), error: null as null | { code: string; message: string }, existing: null as null | { id: string; status: string } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("@/lib/flags", () => ({ isNewslettersEnabled: () => true }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: async () => ({ allowed: true }) }) }));
import { POST } from "./route";
const run = () => POST(new Request("https://example.com/api/newsletters/subscribe", { method: "POST", body: JSON.stringify({ authorId: "11111111-1111-4111-8111-111111111111" }) }));
beforeEach(() => {
  vi.clearAllMocks(); m.error = null; m.existing = null; vi.spyOn(console, "error").mockImplementation(() => {});
  const q = { eq: () => q, select: () => q, maybeSingle: async () => ({ data: m.existing, error: m.error }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
  m.update.mockReturnValue(q); m.insert.mockResolvedValue({ error: null });
  m.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "reader" } } }) }, from: () => ({ ...q, insert: m.insert, update: m.update }) });
});
afterEach(() => vi.restoreAllMocks());
it("stops on an existing-subscription lookup error before any insert/update", async () => {
  m.error = { code: "08006", message: "private lookup details" };
  expect((await run()).status).toBe(500); expect(m.insert).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private lookup details");
});
it("still creates a subscription only after a successful empty lookup", async () => {
  expect((await run()).status).toBe(200); expect(m.insert).toHaveBeenCalledOnce();
});
it("preserves active and previously unsubscribed subscription handling", async () => {
  m.existing = { id: "subscription", status: "active" }; expect((await run()).status).toBe(409); expect(m.insert).not.toHaveBeenCalled();
  m.existing.status = "unsubscribed"; expect((await run()).status).toBe(200); expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
});
