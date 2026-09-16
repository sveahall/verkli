import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const m = vi.hoisted(() => ({ from: vi.fn(), queue: vi.fn(), update: vi.fn(), pro: vi.fn() }));
vi.mock("@/lib/auth/require-author-marketing", () => ({ requireAuthorAndMarketingEnabled: async () => ({ user: { id: "author" } }) }));
vi.mock("@/lib/billing/server", () => ({ requireProBillingForApi: m.pro }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: m.from }) }));
vi.mock("@/lib/marketing-queue", () => ({ enqueueMarketingJob: m.queue }));
const id = "11111111-1111-4111-8111-111111111111";
let plan: object | null;
const run = () => POST(new Request("http://localhost/campaign", { method: "POST" }), { params: Promise.resolve({ id }) });
beforeEach(() => {
 vi.clearAllMocks(); plan = { id, book_id: "book", channels: ["instagram"], languages: ["sv"] };
 m.pro.mockResolvedValue({ ok: true }); m.queue.mockResolvedValue("job");
 m.from.mockImplementation(() => {
  const q = { eq: () => q, select: () => q, update: (v: object) => { m.update(v); return q; }, maybeSingle: async () => ({ data: plan, error: null }), then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) }; return q;
 });
});
describe("resume campaign generation", () => {
 it("queues the same plan so saved posts can be preserved", async () => { expect((await run()).status).toBe(202); expect(m.queue).toHaveBeenCalledWith({ campaignPlanId: id, bookId: "book", authorId: "author", channels: ["instagram"], language: "sv" }); });
 it("does not enqueue an inaccessible, changed or active plan", async () => { plan = null; expect((await run()).status).toBe(409); expect(m.queue).not.toHaveBeenCalled(); });
 it("restores failed state if the queue is unavailable", async () => { m.queue.mockResolvedValue(null); expect((await run()).status).toBe(503); expect(m.update.mock.calls.at(-1)?.[0].status).toBe("failed"); });
 it("still enforces the subscription gate", async () => { m.pro.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) }); expect((await run()).status).toBe(403); expect(m.update).not.toHaveBeenCalled(); });
});
