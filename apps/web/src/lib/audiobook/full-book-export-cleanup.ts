import { validateExportPartManifest, type ExportPartIdentity, type ExportPartManifest } from "./full-book-export-parts";
import type { ExportArtifact, ExportJobRecord, ExportJobStore } from "./full-book-export-jobs";
export type ExportCleanupEntry = { manifest: ExportPartManifest; cleanupAfter: number };
export const EXPORT_CLEANUP_GRACE_MS = 60000;
export function partIdentity(job: Pick<ExportJobRecord, "id" | "ownerId" | "bookId" | "input" | "attemptId">, attemptId = job.attemptId): ExportPartIdentity {
  if (!attemptId) throw new Error("Export attempt identity is missing.");
  return { ownerId: job.ownerId, bookId: job.bookId, editionId: job.input.editionId, jobId: job.id, attemptId, snapshotId: job.input.snapshotId, format: job.input.format };
}
export function multipart(artifact: ExportArtifact): artifact is ExportPartManifest { return "version" in artifact && artifact.version === 2; }
export function sameArtifact(left: ExportArtifact | null | undefined, right: ExportArtifact | null | undefined) { return !!left && !!right && JSON.stringify(left) === JSON.stringify(right); }
export function validateCleanupLedger(value: unknown, job: Pick<ExportJobRecord, "id" | "ownerId" | "bookId" | "input" | "attemptId">): ExportCleanupEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3) throw new Error("Invalid export cleanup ledger.");
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 4 * 1024 * 1024) throw new Error("Export cleanup ledger exceeds 4 MiB. Reconcile previous attempts before retrying.");
  const attempts = new Set<string>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Object.keys(entry).sort().join() !== "cleanupAfter,manifest") throw new Error("Invalid export cleanup entry.");
    const candidate = entry as { manifest: ExportPartManifest; cleanupAfter: number };
    if (!Number.isSafeInteger(candidate.cleanupAfter) || candidate.cleanupAfter < 0 || !candidate.manifest || typeof candidate.manifest.attemptId !== "string") throw new Error("Invalid export cleanup deadline.");
    const manifest = validateExportPartManifest(candidate.manifest, partIdentity(job, candidate.manifest.attemptId));
    if (attempts.has(manifest.attemptId)) throw new Error("Duplicate export cleanup attempt."); attempts.add(manifest.attemptId);
    return { manifest, cleanupAfter: candidate.cleanupAfter };
  });
}
/** A missing row authorizes canonical cleanup; an unreadable row never does. */
export async function reconcileExportCleanup(store: ExportJobStore, trusted: ExportJobRecord, remove: (artifact: ExportArtifact) => Promise<void>): Promise<ExportJobRecord> {
  const read = async () => {
    const row = await store.read(trusted, AbortSignal.timeout(10000));
    if (row && (row.id !== trusted.id || row.ownerId !== trusted.ownerId || row.bookId !== trusted.bookId || JSON.stringify(row.input) !== JSON.stringify(trusted.input))) throw new Error("Export cleanup queue identity mismatch.");
    return row;
  };
  let current = await read();
  const known = new Map<string, ExportCleanupEntry>();
  for (const entry of [...validateCleanupLedger(trusted.cleanup, trusted), ...validateCleanupLedger(current?.cleanup, trusted)]) {
    const previous = known.get(entry.manifest.attemptId);
    if (previous && !sameArtifact(previous.manifest, entry.manifest)) throw new Error("Conflicting cleanup manifest.");
    known.set(entry.manifest.attemptId, entry);
  }
  validateCleanupLedger([...known.values()], trusted);
  const confirmed = new Set<string>();
  for (const entry of known.values()) {
    // Re-read before each attempt; active output must never be inferred from queue data.
    current = await read();
    if (current?.artifact && multipart(current.artifact) && current.artifact.attemptId === entry.manifest.attemptId) { confirmed.add(entry.manifest.attemptId); continue; }
    if (Date.now() < entry.cleanupAfter || (current?.status === "processing" && current.attemptId === entry.manifest.attemptId)) continue;
    await remove(entry.manifest); confirmed.add(entry.manifest.attemptId);
  }
  for (let tries = 0; tries < 3; tries++) {
    current = await read();
    const remaining = [...known.values()].filter((entry) => !confirmed.has(entry.manifest.attemptId));
    if (!current) return { ...trusted, cleanup: remaining };
    const ledger = validateCleanupLedger(current.cleanup, current), cleanup = ledger.filter((entry) => !confirmed.has(entry.manifest.attemptId));
    // A ledger-only CAS would invalidate the active worker's heartbeat version. Retry after it settles.
    if (current.status === "processing" && current.leaseUntil > Date.now()) return { ...current, cleanup: validateCleanupLedger([...new Map([...ledger, ...known.values()].map((entry) => [entry.manifest.attemptId, entry])).values()], current) };
    if (cleanup.length === ledger.length) return { ...current, cleanup: [...new Map([...cleanup, ...remaining].map((entry) => [entry.manifest.attemptId, entry])).values()] };
    const saved = await store.compareAndSwap(current, { cleanup }, AbortSignal.timeout(10000));
    if (saved) return { ...saved, cleanup: [...new Map([...cleanup, ...remaining].map((entry) => [entry.manifest.attemptId, entry])).values()] };
  }
  throw new Error("Export cleanup ledger changed. Retry reconciliation.");
}
