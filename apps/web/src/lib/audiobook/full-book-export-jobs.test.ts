import { describe, expect, it } from "vitest";
import { PrivateExportError } from "./private-export-contract";
import { createFullBookJob, runFullBookJob, type ExportJobRecord, type ExportJobStore, type ExportWorkerDependencies } from "./full-book-export-jobs";
const ownerId = "00000000-0000-4000-8000-000000000001", bookId = "00000000-0000-4000-8000-000000000002";
const input = { editionId: "00000000-0000-4000-8000-000000000003", format: "m4b" as const, requestId: "00000000-0000-4000-8000-000000000004", snapshotId: "a".repeat(64) };
function fixture() {
  let value: ExportJobRecord | null = null, revision = 0, builds = 0, removals = 0;
  const store: ExportJobStore = {
    async read() { return value ? structuredClone(value) : null; },
    async insert(record) { if (!value) value = structuredClone(record); return structuredClone(value); },
    async compareAndSwap(expected, patch) { if (!value || value.updatedAt !== expected.updatedAt || value.status !== expected.status || value.attemptId !== expected.attemptId) return null; value = { ...value, ...patch, updatedAt: new Date(Date.now() + ++revision).toISOString() }; return structuredClone(value); },
  };
  const deps: ExportWorkerDependencies = {
    store,
    async verify() { return input.snapshotId; },
    async build(job, signal) { signal.throwIfAborted(); builds++; return { path: `exports/${job.ownerId}/${job.bookId}/${job.input.editionId}/${job.id}/${job.attemptId}.m4b`, sha256: "b".repeat(64), byteLength: 1000, durationSeconds: 378, chapterCount: 21 }; },
    async remove() { removals++; },
  };
  return { store, deps, get value() { return value!; }, get builds() { return builds; }, get removals() { return removals; } };
}
describe("full book durable export jobs", () => {
  it("deduplicates the same request and rejects changed format for its identity", async () => {
    const f = fixture(), first = await createFullBookJob(f.store, ownerId, bookId, input);
    expect((await createFullBookJob(f.store, ownerId, bookId, input)).id).toBe(first.id);
    await expect(createFullBookJob(f.store, ownerId, bookId, { ...input, format: "mp3-320" })).rejects.toThrow(/identity/i);
  });
  it("finishes once and duplicate delivery performs no encoding", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input);
    await runFullBookJob(f.deps, job, { lastAttempt: true }); await runFullBookJob(f.deps, job, { lastAttempt: true });
    expect(f.value.status).toBe("completed"); expect(f.builds).toBe(1);
  });
  it("does not publish when cancellation races with build completion", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input), build = f.deps.build;
    f.deps.build = async (...args) => { const artifact = await build(...args); await f.store.compareAndSwap(f.value, { status: "cancelled" }); return artifact; };
    await runFullBookJob(f.deps, job, { lastAttempt: true });
    expect(f.value.status).toBe("cancelled"); expect(f.value.artifact).toBeNull(); expect(f.removals).toBe(1);
  });
  it("deletes uploaded output if source changes before publication", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input); let calls = 0;
    f.deps.verify = async () => ++calls === 1 ? input.snapshotId : "c".repeat(64);
    await expect(runFullBookJob(f.deps, job, { lastAttempt: true })).rejects.toThrow(/changed/i);
    expect(f.value.status).toBe("failed"); expect(f.value.artifact).toBeNull(); expect(f.removals).toBe(1);
  });
  it("returns retryable failures to pending without completed output", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input); f.deps.build = async () => { throw new Error("private provider secret"); };
    await expect(runFullBookJob(f.deps, job, { lastAttempt: false })).rejects.toThrow();
    expect(f.value.status).toBe("pending"); expect(f.value.message).not.toContain("secret"); expect(f.value.artifact).toBeNull();
  });
  it("retries a transient production storage error rather than marking failed immediately", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input);
    f.deps.build = async () => { throw new PrivateExportError(503, "SOURCE_READ_FAILED", "Storage temporarily unavailable"); };
    await expect(runFullBookJob(f.deps, job, { lastAttempt: false })).rejects.toThrow();
    expect(f.value.status).toBe("pending");
  });
  it("rejects queue identity mismatch without source reads", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input);
    await expect(runFullBookJob(f.deps, { ...job, ownerId: input.editionId }, { lastAttempt: true })).rejects.toThrow(/identity/i);
    expect(f.builds).toBe(0);
  });
  it("does not publish after the owner deletes the job during encoding", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input), build = f.deps.build;
    f.deps.build = async (...args) => { const artifact = await build(...args); f.store.read = async () => null; f.store.compareAndSwap = async () => null; return artifact; };
    await runFullBookJob(f.deps, job, { lastAttempt: true }); expect(f.removals).toBe(1);
  });
  it("recovers an expired lease with a new attempt identity", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input);
    await f.store.compareAndSwap(job, { status: "processing", attemptId: input.requestId, leaseUntil: Date.now() - 1 });
    await runFullBookJob(f.deps, job, { lastAttempt: true }); expect(f.value.status).toBe("completed"); expect(f.value.attemptId).not.toBe(input.requestId);
  });
  it("preserves an artifact when a completed transaction loses its acknowledgement", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input), swap = f.store.compareAndSwap;
    f.store.compareAndSwap = async (...args) => { const result = await swap(...args); if (args[1].status === "completed") throw new Error("Response lost after commit"); return result; };
    await runFullBookJob(f.deps, job, { lastAttempt: true }); expect(f.value.status).toBe("completed"); expect(f.removals).toBe(0);
  });
  it("retains an uncertain publication until its row can be reconciled", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input), swap = f.store.compareAndSwap;
    f.store.compareAndSwap = async (...args) => { if (args[1].status === "completed") { f.store.read = async () => { throw new Error("Database unavailable"); }; throw new Error("Unknown commit outcome"); } return swap(...args); };
    await expect(runFullBookJob(f.deps, job, { lastAttempt: true })).rejects.toThrow("Database unavailable"); expect(f.removals).toBe(0);
  });
  it("cannot steal an unexpired worker lease", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input);
    await f.store.compareAndSwap(job, { status: "processing", attemptId: input.requestId, leaseUntil: Date.now() + 60000 });
    await expect(runFullBookJob(f.deps, job, { lastAttempt: true })).rejects.toThrow(/running/i); expect(f.builds).toBe(0);
  });
});
