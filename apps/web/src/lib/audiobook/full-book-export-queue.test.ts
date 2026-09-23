import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createFullBookJob } from "./full-book-export-jobs";
const mock = vi.hoisted(() => ({ queue: vi.fn(), getJob: vi.fn(), add: vi.fn() }));
vi.mock("@/lib/audiobook-queue", () => ({ getAudiobookQueue: mock.queue }));
import { enqueueFullBookExport } from "./full-book-export-queue";
async function record() { return createFullBookJob({ insert: async (row) => row, read: vi.fn(), compareAndSwap: vi.fn() }, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", { editionId: "33333333-3333-4333-8333-333333333333", requestId: "44444444-4444-4444-8444-444444444444", snapshotId: "a".repeat(64), format: "m4b" }); }
beforeEach(() => { vi.clearAllMocks(); mock.queue.mockReturnValue({ getJob: mock.getJob, add: mock.add }); mock.getJob.mockResolvedValue(null); mock.add.mockResolvedValue({ id: "ok" }); });
describe("full-book export queue isolation", () => {
  it("queues export with bounded retries and an immutable identity", async () => {
    const job = await record(); await enqueueFullBookExport(job);
    expect(mock.add).toHaveBeenCalledWith("export", job, expect.objectContaining({ jobId: job.id, attempts: 3, backoff: { type: "exponential", delay: 10000 } }));
  });
  it("never removes or reruns an existing completed queue job", async () => {
    const remove = vi.fn(), job = await record(); mock.getJob.mockResolvedValue({ name: "export", data: job, getState: async () => "completed", remove });
    await enqueueFullBookExport(job); expect(mock.add).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });
  it("rejects conflicting queue payloads and unavailable Redis", async () => {
    const job = await record(); mock.getJob.mockResolvedValue({ name: "generate", data: job });
    await expect(enqueueFullBookExport(job)).rejects.toThrow(); mock.queue.mockReturnValue(null);
    await expect(enqueueFullBookExport(job)).rejects.toMatchObject({ code: "EXPORT_QUEUE_UNAVAILABLE" });
  });
  it("dispatches exports and terminal failures before generation or refund paths", () => {
    const worker = readFileSync(new URL("../../../scripts/audiobook-worker.ts", import.meta.url), "utf8");
    const dispatch = worker.slice(worker.indexOf("const worker = new Worker"), worker.indexOf('worker.on("completed"'));
    expect(dispatch.indexOf('job.name === "export"')).toBeLessThan(dispatch.indexOf('job.name === "generate"'));
    expect(dispatch).toMatch(/processFullBookExportJob[\s\S]*?return;/);
    const failure = worker.slice(worker.indexOf('worker.on("failed"'), worker.indexOf('worker.on("error"'));
    expect(failure.indexOf('job?.name === "export"')).toBeLessThan(failure.indexOf("releaseBudget"));
    expect(failure).toMatch(/reconcileFailedFullBookExport[\s\S]*?return;/);
  });
});
