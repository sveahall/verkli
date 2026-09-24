import { partIdentity, reconcileExportCleanup, validateCleanupLedger } from "./full-book-export-cleanup";
import { buildExportPartManifest, exportPartPath } from "./full-book-export-parts";
import { describe, expect, it, vi } from "vitest";
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

function partManifest(job: ExportJobRecord) {
  const identity = partIdentity(job);
  return buildExportPartManifest({ identity, byteLength: 4, sha256: "b".repeat(64), durationSeconds: 1, chapterCount: 1 }, [{ index: 0, offset: 0, byteLength: 4, sha256: "c".repeat(64), path: exportPartPath(identity, 0) }]);
}
describe("multipart job cleanup ledger", () => {
  it("persists the plan and queue checkpoint before any upload and publishes only after verification", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input), checkpoints: ExportJobRecord[] = [];
    f.deps.checkpoint = async (record) => { checkpoints.push(structuredClone(record)); };
    f.deps.build = async (active, _signal, _progress, prepare) => {
      const manifest = partManifest(active); await prepare(manifest);
      expect(f.value.cleanup?.[0].manifest).toEqual(manifest); expect(checkpoints.at(-1)?.cleanup?.[0].manifest).toEqual(manifest);
      return manifest;
    };
    await runFullBookJob(f.deps, job, { lastAttempt: true });
    expect(f.value.status).toBe("completed"); expect(f.value.artifact).toMatchObject({ version: 2 }); expect(f.value.cleanup).toEqual([]);
  });
  it("prevents every upload when the durable queue checkpoint fails", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input); let uploads = 0;
    f.deps.checkpoint = async (record) => { if (record.cleanup?.length) throw new Error("Queue persistence failed"); };
    f.deps.build = async (active, _signal, _progress, prepare) => { const manifest = partManifest(active); await prepare(manifest); uploads++; return manifest; };
    await expect(runFullBookJob(f.deps, job, { lastAttempt: false })).rejects.toThrow();
    expect(uploads).toBe(0); expect(f.value.cleanup).toHaveLength(1); expect(f.value.status).toBe("pending");
  });
  it("retains crashed attempt targets through lease takeover until their cleanup deadline", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input);
    const old = { ...job, attemptId: input.requestId }, previous = { manifest: partManifest(old), cleanupAfter: Date.now() + 3600000 };
    await f.store.compareAndSwap(job, { status: "processing", attemptId: old.attemptId, leaseUntil: Date.now() - 1, cleanup: [previous] });
    f.deps.checkpoint = async () => undefined;
    f.deps.build = async (active, _signal, _progress, prepare) => { const manifest = partManifest(active); await prepare(manifest); expect(f.value.cleanup).toHaveLength(2); return manifest; };
    await runFullBookJob(f.deps, job, { lastAttempt: true });
    expect(f.value.cleanup).toEqual([previous]); expect(f.removals).toBe(0); expect(f.value.attemptId).not.toBe(old.attemptId);
  });
  it("preserves multipart objects after ambiguous committed publication", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input), swap = f.store.compareAndSwap;
    f.deps.checkpoint = async () => undefined;
    f.deps.build = async (active, _signal, _progress, prepare) => { const manifest = partManifest(active); await prepare(manifest); return manifest; };
    f.store.compareAndSwap = async (...args) => { const result = await swap(...args); if (args[1].status === "completed") throw new Error("Response lost"); return result; };
    await runFullBookJob(f.deps, job, { lastAttempt: true }); expect(f.value.status).toBe("completed"); expect(f.removals).toBe(0);
  });
  it("keeps targets after cancellation even when early deletion succeeds", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input); f.deps.checkpoint = async () => undefined;
    f.deps.build = async (active, _signal, _progress, prepare) => { const manifest = partManifest(active); await prepare(manifest); await f.store.compareAndSwap(f.value, { status: "cancelled" }); return manifest; };
    await runFullBookJob(f.deps, job, { lastAttempt: true }); expect(f.value.cleanup).toHaveLength(1); expect(f.removals).toBe(1); expect(f.value.artifact).toBeNull();
  });
  it("does not erase cleanup references on failed deletion and removes them only after confirmation", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input), target = { manifest: partManifest({ ...job, attemptId: input.requestId }), cleanupAfter: 0 };
    await f.store.compareAndSwap(job, { cleanup: [target], status: "failed" });
    await expect(reconcileExportCleanup(f.store, f.value, async () => { throw new Error("Deletion unavailable"); })).rejects.toThrow(); expect(f.value.cleanup).toEqual([target]);
    const result = await reconcileExportCleanup(f.store, f.value, f.deps.remove); expect(result.cleanup).toEqual([]); expect(f.value.cleanup).toEqual([]);
  });
  it("cleans a deleted row using a validated retained queue plan and can reconcile a very late PUT again", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input), target = { manifest: partManifest({ ...job, attemptId: input.requestId }), cleanupAfter: 0 }, trusted = { ...job, cleanup: [target] };
    const objects = new Set(target.manifest.parts.map((part) => part.path)); f.store.read = async () => null;
    const remove = async () => { objects.clear(); };
    await reconcileExportCleanup(f.store, trusted, remove); expect(objects.size).toBe(0); expect(trusted.cleanup).toEqual([target]);
    // A remote PUT may finish beyond any local deadline. Retained queue metadata remains a cleanup authority, never a publication authority.
    objects.add(target.manifest.parts[0].path); await reconcileExportCleanup(f.store, trusted, remove); expect(objects.size).toBe(0);
  });
  it("protects a published manifest and preserves every target while the database is unavailable", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input), active = { ...job, attemptId: input.requestId }, manifest = partManifest(active), trusted = { ...active, cleanup: [{ manifest, cleanupAfter: 0 }] };
    await f.store.compareAndSwap(job, { attemptId: active.attemptId, status: "completed", artifact: manifest });
    await reconcileExportCleanup(f.store, trusted, f.deps.remove); expect(f.removals).toBe(0);
    f.store.read = async () => { throw new Error("DB unavailable"); }; await expect(reconcileExportCleanup(f.store, trusted, f.deps.remove)).rejects.toThrow(); expect(f.removals).toBe(0);
  });
  it("rejects a fourth attempt ledger and foreign cleanup paths", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input), target = { manifest: partManifest({ ...job, attemptId: input.requestId }), cleanupAfter: 0 };
    expect(() => validateCleanupLedger([target, target, target, target], job)).toThrow();
    expect(() => validateCleanupLedger([{ ...target, manifest: { ...target.manifest, ownerId: bookId } }], job)).toThrow();
  });
});

describe("checkpoint cancellation and concurrent cleanup", () => {
  it("unwinds a stalled pre-upload checkpoint on cancellation without making a PUT", async () => {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input), controller = new AbortController(); let prepared!: () => void, uploads = 0, checkpoints = 0;
    const waiting = new Promise<void>((resolve) => { prepared = resolve; });
    f.deps.checkpoint = async (record) => { if (record.cleanup?.length && ++checkpoints === 1) { prepared(); await new Promise<void>(() => undefined); } };
    f.deps.build = async (active, _signal, _progress, prepare) => { const manifest = partManifest(active); await prepare(manifest); uploads++; return manifest; };
    const result = runFullBookJob(f.deps, job, { lastAttempt: true, signal: controller.signal }); const assertion = expect(result).rejects.toThrow();
    await waiting; controller.abort(new Error("Cancelled")); await assertion;
    expect(uploads).toBe(0); expect(f.value.cleanup).toHaveLength(1); expect(f.value.status).toBe("failed");
  });
  it("bounds a stalled initial and final checkpoint and handles late rejection", async () => {
    vi.useFakeTimers();
    try {
      for (const phase of ["initial", "final"]) {
        const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input); let rejectLate!: (error: Error) => void;
        f.deps.checkpoint = async (record) => { if (phase === "initial" || record.status === "completed") await new Promise<void>((_resolve, reject) => { rejectLate = reject; }); };
        const pending = runFullBookJob(f.deps, job, { lastAttempt: true }); const assertion = expect(pending).rejects.toThrow(/checkpoint timed out/);
        await vi.advanceTimersByTimeAsync(10001); await assertion; rejectLate(new Error("Late Redis rejection")); await vi.advanceTimersByTimeAsync(0);
        expect(f.value.status).toBe(phase === "initial" ? "pending" : "completed"); expect(f.removals).toBe(0);
      }
    } finally { vi.useRealTimers(); }
  });
  it("does not invalidate a healthy worker when cleanup deletes an older attempt", async () => {
    vi.useFakeTimers();
    try {
    const f = fixture(), job = await createFullBookJob(f.store, ownerId, bookId, input), old = { manifest: partManifest({ ...job, attemptId: input.requestId }), cleanupAfter: Date.now() + 10000 };
    await f.store.compareAndSwap(job, { cleanup: [old] }); f.deps.checkpoint = async () => undefined;
    f.deps.build = async (active, _signal, progress, prepare) => {
      const manifest = partManifest(active); await prepare(manifest);
      // Let the scheduled deadline become eligible while the new attempt keeps its healthy lease.
      vi.setSystemTime(Date.now() + 11000);
      const trusted = { ...active, cleanup: [old] };
      const before = f.value.updatedAt; const pending = await reconcileExportCleanup(f.store, trusted, f.deps.remove);
      expect(pending.cleanup?.length).toBeGreaterThan(0); expect(f.value.updatedAt).toBe(before);
      await progress("Continuing healthy attempt", 60); return manifest;
    };
    await runFullBookJob(f.deps, job, { lastAttempt: true }); expect(f.value.status).toBe("completed"); expect(f.value.cleanup).toHaveLength(1);
    await reconcileExportCleanup(f.store, f.value, f.deps.remove); expect(f.value.cleanup).toEqual([]);
    } finally { vi.useRealTimers(); }
  });
});
