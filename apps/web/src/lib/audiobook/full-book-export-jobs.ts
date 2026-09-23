import { createHash, randomUUID } from "node:crypto";
import { fullBookExportRequestSchema, type FullBookExportRequest } from "./full-book-export-contract";
import { PrivateExportError } from "./private-export-contract";
export type ExportArtifact = { path: string; sha256: string; byteLength: number; durationSeconds: number; chapterCount: number };
export type ExportJobRecord = {
  id: string; ownerId: string; bookId: string; input: FullBookExportRequest;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  createdAt: string; updatedAt: string; attemptId: string | null; leaseUntil: number;
  phase: string; progress: number; message: string | null; artifact: ExportArtifact | null;
};
export type ExportJobPatch = Partial<Pick<ExportJobRecord, "status" | "attemptId" | "leaseUntil" | "phase" | "progress" | "message" | "artifact">>;
export type ExportJobStore = {
  read(identity: Pick<ExportJobRecord, "id" | "ownerId" | "bookId" | "input">, signal?: AbortSignal): Promise<ExportJobRecord | null>;
  insert(record: ExportJobRecord, signal?: AbortSignal): Promise<ExportJobRecord>;
  compareAndSwap(expected: ExportJobRecord, patch: ExportJobPatch, signal?: AbortSignal): Promise<ExportJobRecord | null>;
};
export type ExportWorkerDependencies = {
  store: ExportJobStore;
  verify(job: ExportJobRecord, signal: AbortSignal): Promise<string>;
  build(job: ExportJobRecord, signal: AbortSignal, progress: (phase: string, percent: number) => Promise<void>): Promise<ExportArtifact>;
  remove(artifact: ExportArtifact): Promise<void>;
};
export function fullBookJobId(ownerId: string, bookId: string, requestId: string) {
  const hex = createHash("sha256").update(JSON.stringify(["audiobook_export_v1", ownerId, bookId, requestId])).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function sameIdentity(left: ExportJobRecord, right: ExportJobRecord) {
  return left.id === right.id && left.ownerId === right.ownerId && left.bookId === right.bookId && JSON.stringify(left.input) === JSON.stringify(right.input);
}
export async function createFullBookJob(store: ExportJobStore, ownerId: string, bookId: string, value: FullBookExportRequest, signal?: AbortSignal) {
  const input = fullBookExportRequestSchema.parse(value), now = new Date().toISOString();
  const proposed: ExportJobRecord = { id: fullBookJobId(ownerId, bookId, input.requestId), ownerId, bookId, input, status: "pending", createdAt: now, updatedAt: now, attemptId: null, leaseUntil: 0, phase: "Waiting for export worker", progress: 0, message: null, artifact: null };
  const existing = await store.insert(proposed, signal);
  if (!sameIdentity(existing, proposed)) throw new PrivateExportError(409, "EXPORT_IDENTITY_CONFLICT", "This request identity belongs to another export. Reload before making a new request.");
  return existing;
}
const changed = () => new PrivateExportError(409, "SOURCE_CHANGED", "The edition or its audio changed. Reload the edition before exporting again.");
/** Queue retries operate only on this export pipeline; no synthesis or billing dependency exists. */
export async function runFullBookJob(deps: ExportWorkerDependencies, trusted: ExportJobRecord, options: { lastAttempt: boolean; signal?: AbortSignal }) {
  let current = await deps.store.read(trusted, AbortSignal.timeout(10000));
  if (!current) return; // Owner deleted the job: it must not be resurrected.
  if (!sameIdentity(current, trusted)) throw new Error("Full-book export queue identity mismatch.");
  if (["completed", "failed", "cancelled"].includes(current.status)) return;
  if (current.status === "processing" && current.leaseUntil > Date.now()) throw new Error("This full-book export is already running.");
  const claimed = await deps.store.compareAndSwap(current, { status: "processing", attemptId: randomUUID(), leaseUntil: Date.now() + 30000, phase: "Verifying source audio", progress: 1, message: null, artifact: null });
  if (!claimed) throw new Error("Full-book export claim changed. Retry the queued job.");
  current = claimed;
  const controller = new AbortController(), signal = AbortSignal.any([controller.signal, AbortSignal.timeout(3600000), ...(options.signal ? [options.signal] : [])]);
  let operations = Promise.resolve(), artifact: ExportArtifact | undefined, published = false, publicationAttempted = false, publicationUnknown = false;
  const update = (patch: ExportJobPatch) => {
    const next = operations.then(async () => {
      signal.throwIfAborted();
      if (current!.status !== "processing" || current!.leaseUntil <= Date.now()) throw new Error("Full-book export lease expired.");
      const result = await deps.store.compareAndSwap(current!, patch, signal);
      if (!result) throw new Error("Full-book export was cancelled or its worker lease changed.");
      current = result;
    });
    operations = next.catch((error) => { controller.abort(error); });
    return next;
  };
  const heartbeat = setInterval(() => { void update({ leaseUntil: Date.now() + 30000 }).catch(() => undefined); }, 5000);
  try {
    if (await deps.verify(current, signal) !== current.input.snapshotId) throw changed();
    artifact = await deps.build(current, signal, (phase, percent) => update({ phase, progress: Math.min(95, Math.max(1, Math.floor(percent))), leaseUntil: Date.now() + 30000 }));
    signal.throwIfAborted();
    if (await deps.verify(current, signal) !== current.input.snapshotId) throw changed();
    clearInterval(heartbeat); await operations; signal.throwIfAborted();
    await update({ leaseUntil: Date.now() + 30000 });
    publicationAttempted = true;
    await update({ status: "completed", phase: "Verified file ready", progress: 100, leaseUntil: 0, artifact, message: null });
    published = true;
  } catch (error) {
    clearInterval(heartbeat); await operations;
    let latest: ExportJobRecord | null;
    try { latest = await deps.store.read(trusted, AbortSignal.timeout(10000)); }
    catch (lookupError) { publicationUnknown = publicationAttempted; throw lookupError; }
    // A lost acknowledgement can follow a committed transaction. Preserve that verified file.
    if (latest?.status === "completed" && latest.attemptId === claimed.attemptId && latest.artifact?.path === artifact?.path) { published = true; return; }
    if (latest?.status === "processing" && latest.attemptId === claimed.attemptId) {
      const terminal = options.lastAttempt || (error instanceof PrivateExportError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) || options.signal?.aborted;
      await deps.store.compareAndSwap(latest, { status: terminal ? "failed" : "pending", phase: terminal ? "Export failed" : "Waiting to retry export", message: error instanceof PrivateExportError ? error.message : "The export could not be completed. No file was published.", leaseUntil: 0, artifact: null });
    }
    // Cancellation wins over a late encoder/upload result; do not retry it.
    if (latest?.status !== "cancelled" && latest !== null) throw error;
  } finally {
    clearInterval(heartbeat); controller.abort(); await operations;
    if (artifact && !published && !publicationUnknown) await deps.remove(artifact);
  }
}
