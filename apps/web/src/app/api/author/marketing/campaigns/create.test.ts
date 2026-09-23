import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), queue: vi.fn(), insert: vi.fn(), update: vi.fn(), health: vi.fn() }));
vi.mock("@/lib/auth/require-author-marketing", () => ({ requireAuthorAndMarketingEnabled: async () => ({ user: { id: "author" } }) }));
vi.mock("@/lib/billing/server", () => ({ requireProBillingForApi: async () => ({ ok: true }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: m.from }) }));
vi.mock("@/lib/marketing-queue", () => ({ enqueueMarketingJob: m.queue }));
vi.mock("@/lib/health/worker-heartbeat", () => ({ getHeartbeats: m.health, getHeartbeatStaleMs: () => 180_000 }));
import { POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const body = { bookId: id, languages: ["en"], contentTypes: ["text"], channels: ["x"], frequency: "1-3", startDate: "2026-09-16" };
const run = () => POST(new Request("http://localhost/campaigns", { method: "POST", body: JSON.stringify(body) }));
beforeEach(() => {
  vi.clearAllMocks(); m.queue.mockResolvedValue("job");
  vi.stubEnv("MARKETING_DAILY_BUDGET", "100000"); vi.stubEnv("MARKETING_JOB_CAP_UNITS", "20000");
  m.health.mockResolvedValue({ redis: true, heartbeats: { "marketing-campaign": { lastSeen: new Date().toISOString(), stale: false, crashed: false } } });
  m.from.mockImplementation((table: string) => {
    let inserted = {};
    const q = { eq: () => q, select: () => q,
      insert: (value: object) => { m.insert(value); inserted = value; return q; },
      update: (value: object) => { m.update(value); return q; },
      maybeSingle: async () => ({ data: table === "books" ? { id, title: "Test book", author_id: "author" } : null, error: null }),
      single: async () => ({ data: { ...inserted, id: "plan" }, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    }; return q;
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("campaign creation consumer readiness", () => {
  it.each(["organic", "paid"])("does not pass an ad draft through generation with mode %s", async mode => {
    const response = await POST(new Request("http://localhost/campaigns", { method: "POST", body: JSON.stringify({ ...body, mode, paidConfig: { kind: "ad_draft", version: 999 } }) }));
    expect(response.status).toBe(409);
    expect(m.from).not.toHaveBeenCalled();
    expect(m.queue).not.toHaveBeenCalled();
  });
  it.each(["missing", "stale", "read-failure"])("does not create or enqueue a campaign when health is %s", async (scenario) => {
    if (scenario === "read-failure") m.health.mockRejectedValue(new Error("Redis down"));
    else m.health.mockResolvedValue({ redis: true, heartbeats: scenario === "missing" ? {} : { "marketing-campaign": { lastSeen: "2020-01-01T00:00:00Z", stale: true, crashed: true } } });
    const response = await run();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "MARKETING_GENERATION_UNAVAILABLE", detail: expect.stringContaining("try again later") });
    expect(m.insert).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.queue).not.toHaveBeenCalled();
  });
  it("does not create a campaign when explicit marketing budgets are absent", async () => {
    vi.stubEnv("MARKETING_JOB_CAP_UNITS", "");
    expect((await run()).status).toBe(503);
    expect(m.insert).not.toHaveBeenCalled(); expect(m.queue).not.toHaveBeenCalled();
  });
  it("creates and queues normally with a healthy consumer", async () => {
    expect((await run()).status).toBe(200);
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "generating" }));
    expect(m.queue).toHaveBeenCalledWith(expect.objectContaining({ campaignPlanId: "plan" }));
  });
  it("marks the new plan failed if queueing throws after the readiness check", async () => {
    m.queue.mockRejectedValue(new Error("Redis disconnected"));
    expect((await run()).status).toBe(503);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});
