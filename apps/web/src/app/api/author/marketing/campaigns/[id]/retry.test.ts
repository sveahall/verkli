import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const m = vi.hoisted(() => ({ from: vi.fn(), queue: vi.fn(), update: vi.fn(), pro: vi.fn(), health: vi.fn(), not: vi.fn() }));
vi.mock("@/lib/auth/require-author-marketing", () => ({ requireAuthorAndMarketingEnabled: async () => ({ user: { id: "author" } }) }));
vi.mock("@/lib/billing/server", () => ({ requireProBillingForApi: m.pro }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: m.from }) }));
vi.mock("@/lib/marketing-queue", () => ({ enqueueMarketingJob: m.queue }));
vi.mock("@/lib/health/worker-heartbeat", () => ({ getHeartbeats: m.health, getHeartbeatStaleMs: () => 180_000 }));
const id = "11111111-1111-4111-8111-111111111111";
let plan: object | null;
let adDraft = false;
const run = () => POST(new Request("http://localhost/campaign", { method: "POST" }), { params: Promise.resolve({ id }) });
beforeEach(() => {
 vi.clearAllMocks(); adDraft = false; plan = { id, book_id: "book", channels: ["instagram"], languages: ["sv"] };
 vi.stubEnv("MARKETING_DAILY_BUDGET", "100000"); vi.stubEnv("MARKETING_JOB_CAP_UNITS", "20000");
 m.health.mockResolvedValue({ redis: true, heartbeats: { "marketing-campaign": { lastSeen: new Date().toISOString(), stale: false, crashed: false } } });
 m.pro.mockResolvedValue({ ok: true }); m.queue.mockResolvedValue("job");
 m.from.mockImplementation(() => {
  let excludesAdDraft = false;
  const q = { not: (column: string, operator: string, value: string) => { m.not(column, operator, value); excludesAdDraft = column === "paid_config" && operator === "cs" && JSON.parse(value).kind === "ad_draft"; return q; }, eq: () => q, select: () => q, update: (v: object) => { m.update(v); return q; }, maybeSingle: async () => ({ data: adDraft && excludesAdDraft ? null : plan, error: null }), then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) }; return q;
 });
});
afterEach(() => vi.unstubAllEnvs());
describe("resume campaign generation", () => {
 it("refuses an ad draft even when a stale/adversarial caller requests failed-plan retry", async () => {
   adDraft = true;
   expect((await run()).status).toBe(409);
   expect(m.queue).not.toHaveBeenCalled();
   expect(m.not).toHaveBeenCalledWith("paid_config", "cs", '{"kind":"ad_draft"}');
 });
 it.each(["missing", "stale", "read-failure"])("leaves existing campaign and saved drafts untouched when health is %s", async (scenario) => {
   if (scenario === "read-failure") m.health.mockRejectedValue(new Error("Redis down"));
   else m.health.mockResolvedValue({ redis: true, heartbeats: scenario === "missing" ? {} : { "marketing-campaign": { lastSeen: "2020-01-01T00:00:00Z", stale: true, crashed: true } } });
   const response = await run();
   expect(response.status).toBe(503);
   expect(await response.json()).toMatchObject({ detail: expect.stringContaining("try again later") });
   expect(m.update).not.toHaveBeenCalled(); expect(m.queue).not.toHaveBeenCalled();
 });
 it("queues the same plan so saved posts can be preserved", async () => { expect((await run()).status).toBe(202); expect(m.queue).toHaveBeenCalledWith({ campaignPlanId: id, bookId: "book", authorId: "author", channels: ["instagram"], language: "sv" }); });
 it("does not enqueue an inaccessible, changed or active plan", async () => { plan = null; expect((await run()).status).toBe(409); expect(m.queue).not.toHaveBeenCalled(); });
 it("restores failed state if the queue is unavailable", async () => { m.queue.mockResolvedValue(null); expect((await run()).status).toBe(503); expect(m.update.mock.calls.at(-1)?.[0].status).toBe("failed"); });
 it("still enforces the subscription gate", async () => { m.pro.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) }); expect((await run()).status).toBe(403); expect(m.update).not.toHaveBeenCalled(); });
});
