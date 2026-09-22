import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connection: vi.fn(), getJob: vi.fn(), close: vi.fn(), construct: vi.fn() }));
vi.mock("@/lib/env", () => ({ getRedisConnectionOptions: mocks.connection }));
vi.mock("bullmq", () => ({ Queue: class {
  constructor(...args: unknown[]) { mocks.construct(...args); }
  on() { return this; }
  getJob = mocks.getJob;
  close = mocks.close;
} }));
import { loadImportQueueDiagnostic } from "./import-diagnostics";
beforeEach(() => { vi.clearAllMocks(); mocks.connection.mockReturnValue({ host: "localhost", port: 6379 }); mocks.close.mockResolvedValue(undefined); });
describe("import queue diagnostic", () => {
  it("reads only the matching job and excludes payloads and failure text", async () => {
    mocks.getJob.mockResolvedValue({ getState: async () => "failed", attemptsMade: 2, data: { manuscript: "private" }, failedReason: "private" });
    expect(await loadImportQueueDiagnostic("import-id")).toEqual({ availability: "available", state: "failed", attemptsMade: 2 });
    expect(mocks.getJob).toHaveBeenCalledExactlyOnceWith("import-id");
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("distinguishes evicted jobs from unavailable Redis", async () => {
    mocks.getJob.mockResolvedValue(undefined);
    expect(await loadImportQueueDiagnostic("id")).toMatchObject({ availability: "missing" });
    mocks.getJob.mockRejectedValue(new Error("private redis address"));
    expect(await loadImportQueueDiagnostic("id")).toEqual({ availability: "unavailable", state: null, attemptsMade: null });
    expect(mocks.close).toHaveBeenCalledTimes(2);
  });
  it("does not connect without configuration and constrains unexpected state", async () => {
    mocks.connection.mockReturnValue(null);
    expect(await loadImportQueueDiagnostic("id")).toMatchObject({ availability: "unavailable" });
    expect(mocks.construct).not.toHaveBeenCalled();
    mocks.connection.mockReturnValue({ host: "localhost", port: 6379 });
    mocks.getJob.mockResolvedValue({ getState: async () => "private", attemptsMade: -1 });
    expect(await loadImportQueueDiagnostic("id")).toEqual({ availability: "available", state: "unknown", attemptsMade: null });
  });
});
