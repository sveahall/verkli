import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getJob: vi.fn(), add: vi.fn(), close: vi.fn(), url: vi.fn(), connection: vi.fn() }));
vi.mock("bullmq", () => ({ Queue: class { getJob = mocks.getJob; add = mocks.add; close = mocks.close; } }));
vi.mock("@/lib/env", () => ({ getRedisUrl: mocks.url, getRedisConnectionOptions: mocks.connection }));
import { enqueueExtractJob, type ExtractJobData } from "./import-queue";
const data: ExtractJobData = { importId: "00000000-0000-4000-8000-000000000001", authorId: "00000000-0000-4000-8000-000000000002", filePath: "owned/source.txt", fileStorage: "supabase", mode: "new_version", targetVersionId: null };
function job(state = "waiting", payload = data) { return { id: data.importId, data: payload, getState: vi.fn().mockResolvedValue(state), remove: vi.fn().mockResolvedValue(undefined) }; }
beforeEach(() => {
  vi.resetAllMocks();
  mocks.url.mockReturnValue("redis://synthetic");
  mocks.connection.mockReturnValue({ host: "synthetic", port: 6379 });
  mocks.getJob.mockResolvedValueOnce(null).mockResolvedValue(job());
  mocks.add.mockResolvedValue(job());
});
describe("confirmed deterministic import dispatch", () => {
  it("returns null without Redis configuration", async () => { mocks.url.mockReturnValue(undefined); expect(await enqueueExtractJob(data)).toBeNull(); expect(mocks.add).not.toHaveBeenCalled(); });
  it("returns null without a valid connection", async () => { mocks.connection.mockReturnValue(null); expect(await enqueueExtractJob(data)).toBeNull(); });
  it("confirms persisted payload after adding a deterministic ID", async () => {
    expect(await enqueueExtractJob(data)).toBe(data.importId);
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith("extract", data, { jobId: data.importId });
    expect(mocks.getJob).toHaveBeenCalledTimes(2);
  });
  it.each(["failed", "completed"])("removes a retained %s job before re-adding", async (state) => {
    const existing = job(state); mocks.getJob.mockReset().mockResolvedValueOnce(existing).mockResolvedValue(job());
    expect(await enqueueExtractJob(data)).toBe(data.importId);
    expect(existing.remove).toHaveBeenCalledTimes(1);
    expect(existing.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.add.mock.invocationCallOrder[0]);
  });
  it.each([
    { state: "failed", field: "authorId" }, { state: "failed", field: "filePath" },
    { state: "completed", field: "authorId" }, { state: "completed", field: "filePath" },
  ])("rejects a retained $state job with a different $field without removing it", async ({ state, field }) => {
    const existing = job(state, { ...data, [field]: "foreign" });
    mocks.getJob.mockReset().mockResolvedValue(existing);
    await expect(enqueueExtractJob(data)).rejects.toThrow();
    expect(existing.remove).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
  });
  it.each(["failed", "completed"])("re-dispatches a retained %s source after the worker filled book/version results", async (state) => {
    const retryData = { ...data, bookId: "00000000-0000-4000-8000-000000000003", targetVersionId: "00000000-0000-4000-8000-000000000004" };
    const original = job(state);
    mocks.getJob.mockReset().mockResolvedValueOnce(original).mockResolvedValue(job("waiting", retryData));
    expect(await enqueueExtractJob(retryData)).toBe(data.importId);
    expect(original.remove).toHaveBeenCalledTimes(1);
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith("extract", retryData, { jobId: data.importId });
  });
  it.each(["waiting", "active", "delayed", "prioritized", "paused"])("acknowledges a matching %s job without adding", async (state) => {
    mocks.getJob.mockReset().mockResolvedValue(job(state));
    expect(await enqueueExtractJob(data)).toBe(data.importId); expect(mocks.add).not.toHaveBeenCalled();
  });
  it.each(["authorId", "filePath", "fileStorage", "importId", "mode", "bookId", "targetVersionId"])("rejects an active job with a different %s", async (field) => {
    mocks.getJob.mockReset().mockResolvedValue(job("active", { ...data, [field]: "other" }));
    await expect(enqueueExtractJob(data)).rejects.toThrow(); expect(mocks.add).not.toHaveBeenCalled();
  });
  it("rejects an unknown existing state", async () => { mocks.getJob.mockReset().mockResolvedValue(job("unknown")); await expect(enqueueExtractJob(data)).rejects.toThrow(); });
  it("checks persisted data when add silently returns a duplicate ID", async () => {
    mocks.getJob.mockReset().mockResolvedValueOnce(null).mockResolvedValue(job("waiting", { ...data, authorId: "foreign" }));
    await expect(enqueueExtractJob(data)).rejects.toThrow();
  });
  it("never acknowledges an exhausted failed job after add", async () => {
    mocks.getJob.mockReset().mockResolvedValueOnce(null).mockResolvedValue(job("failed"));
    await expect(enqueueExtractJob(data)).rejects.toThrow();
  });
  it("recognizes a newly dispatched job that has already completed", async () => {
    mocks.getJob.mockReset().mockResolvedValueOnce(null).mockResolvedValue(job("completed"));
    expect(await enqueueExtractJob(data)).toBe(data.importId);
  });
  it.each(["lookup", "add", "remove", "confirmation"])("propagates %s failures", async (stage) => {
    if (stage === "lookup") mocks.getJob.mockReset().mockRejectedValue(new Error("lookup unavailable"));
    if (stage === "add") mocks.add.mockRejectedValue(new Error("Job already exists"));
    if (stage === "remove") { const previous = job("failed"); previous.remove.mockRejectedValue(new Error("remove unavailable")); mocks.getJob.mockReset().mockResolvedValue(previous); }
    if (stage === "confirmation") mocks.getJob.mockReset().mockResolvedValueOnce(null).mockRejectedValue(new Error("confirmation unavailable"));
    await expect(enqueueExtractJob(data)).rejects.toThrow();
  });
  it("rejects a missing persisted job", async () => { mocks.getJob.mockReset().mockResolvedValue(null); await expect(enqueueExtractJob(data)).rejects.toThrow(); });
});
