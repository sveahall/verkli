import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ readiness: vi.fn(), getJob: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/marketing/queue-readiness", () => ({ getMarketingQueueReadiness: m.readiness }));
vi.mock("@/lib/env", () => ({ getRedisUrl: () => "redis://fixture", getRedisConnectionOptions: () => ({ host: "fixture", port: 6379 }) }));
vi.mock("bullmq", () => ({ Queue: class { getJob = m.getJob; add = m.add; close = async () => {}; } }));
import { enqueueMarketingJob } from "./marketing-queue";
const payload = { bookId: "book", authorId: "author", channels: ["x"], language: "en", campaignPlanId: "plan" };
beforeEach(() => {
  vi.clearAllMocks();
  m.readiness.mockResolvedValue({ ok: true }); m.getJob.mockResolvedValue(null); m.add.mockResolvedValue({ id: "job" });
});
describe("marketing producer admission", () => {
  it("does not add or remove even an existing queued job without a ready consumer", async () => {
    m.readiness.mockResolvedValue({ ok: false, code: "MARKETING_GENERATION_UNAVAILABLE" });
    m.getJob.mockResolvedValue({ id: "old-job", getState: async () => "waiting", remove: m.remove });
    expect(await enqueueMarketingJob(payload)).toBeNull();
    expect(m.getJob).not.toHaveBeenCalled(); expect(m.remove).not.toHaveBeenCalled(); expect(m.add).not.toHaveBeenCalled();
  });
  it("applies the same gate to legacy book scheduling", async () => {
    m.readiness.mockResolvedValue({ ok: false, code: "MARKETING_GENERATION_UNAVAILABLE" });
    expect(await enqueueMarketingJob({ ...payload, campaignPlanId: undefined })).toBeNull();
    expect(m.add).not.toHaveBeenCalled();
  });
  it("adds a campaign normally after successful readiness", async () => {
    expect(await enqueueMarketingJob(payload)).toBe("job");
    expect(m.add).toHaveBeenCalledWith("marketing-generate", payload, expect.objectContaining({ jobId: expect.any(String) }));
  });
  it("passes the installed BullMQ custom job ID validation", async () => {
    const { Job } = await vi.importActual<typeof import("bullmq")>("bullmq");
    m.add.mockImplementation(async (_name, data, options) => {
      // Exercise BullMQ's real admission validator without connecting Redis.
      Reflect.apply(Reflect.get(Job.prototype, "validateOptions"), { opts: options }, [{ data: JSON.stringify(data) }]);
      return { id: options.jobId };
    });
    await expect(enqueueMarketingJob(payload)).resolves.toMatch(/^marketing-/);
  });
  it("keeps a legacy active job instead of dispatching duplicate paid work", async () => {
    m.getJob.mockImplementation(async (id: string) => id.includes(":") ? { id, getState: async () => "active", remove: m.remove } : null);
    await expect(enqueueMarketingJob(payload)).resolves.toMatch(/^marketing:/);
    expect(m.add).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });
});
