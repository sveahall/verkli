import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createFullBookJob } from "./full-book-export-jobs";
const mock = vi.hoisted(() => ({ queue: vi.fn(), getJob: vi.fn(), add: vi.fn() }));
vi.mock("@/lib/audiobook-queue", () => ({ getAudiobookQueue: mock.queue }));
import { partIdentity } from "./full-book-export-cleanup";
import { buildExportPartManifest, exportPartPath } from "./full-book-export-parts";
import { enqueueFullBookExport, enqueueExportCleanup } from "./full-book-export-queue";
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

describe("retained multipart cleanup checkpoints", () => {
  it("queues stable delayed cleanup without pruning success or failure metadata", async () => {
    const job = { ...await record(), attemptId: "55555555-5555-4555-8555-555555555555" }, identity = partIdentity(job);
    const manifest = buildExportPartManifest({ identity, byteLength: 1, sha256: "b".repeat(64), durationSeconds: 1, chapterCount: 1 }, [{ index: 0, offset: 0, byteLength: 1, sha256: "b".repeat(64), path: exportPartPath(identity, 0) }]);
    const checkpoint = { ...job, cleanup: [{ manifest, cleanupAfter: Date.now() + 3600000 }] };
    await enqueueExportCleanup(checkpoint);
    expect(mock.add).toHaveBeenCalledWith("export-cleanup", checkpoint, expect.objectContaining({ jobId: `${job.id}-cleanup-${job.attemptId}`, removeOnComplete: false, removeOnFail: false, attempts: 10 }));
    expect(mock.add.mock.calls[0][2].delay).toBeGreaterThan(3500000);
    mock.getJob.mockResolvedValue({ name: "export-cleanup", data: checkpoint }); await enqueueExportCleanup(checkpoint); expect(mock.add).toHaveBeenCalledTimes(1);
  });
  it("rejects forged cleanup bindings before scheduling and isolates the cleanup worker from TTS", async () => {
    const job = { ...await record(), attemptId: "55555555-5555-4555-8555-555555555555" }, identity = partIdentity(job);
    const manifest = buildExportPartManifest({ identity, byteLength: 1, sha256: "b".repeat(64), durationSeconds: 1, chapterCount: 1 }, [{ index: 0, offset: 0, byteLength: 1, sha256: "b".repeat(64), path: exportPartPath(identity, 0) }]);
    await expect(enqueueExportCleanup({ ...job, cleanup: [{ manifest: { ...manifest, ownerId: job.bookId }, cleanupAfter: 0 }] })).rejects.toThrow(); expect(mock.add).not.toHaveBeenCalled();
    const worker = readFileSync(new URL("../../../scripts/audiobook-worker.ts", import.meta.url), "utf8");
    const dispatch = worker.slice(worker.indexOf("const worker = new Worker"), worker.indexOf('worker.on("completed"'));
    expect(dispatch.indexOf('job.name === "export-cleanup"')).toBeLessThan(dispatch.indexOf('job.name === "generate"'));
    expect(dispatch).toMatch(/reconcileFullBookExportCleanup[\s\S]*?return;/);
    const failure = worker.slice(worker.indexOf('worker.on("failed"'), worker.indexOf('worker.on("error"'));
    expect(failure.indexOf('job?.name === "export-cleanup"')).toBeLessThan(failure.indexOf("releaseBudget"));
  });
});
