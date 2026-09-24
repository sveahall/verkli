import { getAudiobookQueue } from "@/lib/audiobook-queue";
import { fullBookExportRequestSchema } from "./full-book-export-contract";
import { type ExportJobRecord } from "./full-book-export-jobs";
import { PrivateExportError } from "./private-export-contract";
function identity(value: ExportJobRecord) {
  return JSON.stringify([value.id, value.ownerId, value.bookId, fullBookExportRequestSchema.parse(value.input)]);
}
/** Completed/failed queue entries are never removed to manufacture another attempt. */
export async function enqueueFullBookExport(record: ExportJobRecord): Promise<void> {
  if (record.status !== "pending") return;
  const queue = getAudiobookQueue();
  if (!queue) throw new PrivateExportError(503, "EXPORT_QUEUE_UNAVAILABLE", "The audio export worker is unavailable. Try again shortly.");
  const existing = await queue.getJob(record.id);
  if (existing) {
    if (existing.name !== "export" || identity(existing.data as ExportJobRecord) !== identity(record)) throw new PrivateExportError(409, "EXPORT_IDENTITY_CONFLICT", "This request identity belongs to another job. Reload before exporting again.");
    return;
  }
  await queue.add("export", record, { jobId: record.id, attempts: 3, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: false, removeOnFail: false });
}

/** Cleanup metadata is retained on failure; no pruning may erase unresolved part namespaces. */
export async function enqueueExportCleanup(record: ExportJobRecord): Promise<void> {
  const { validateCleanupLedger } = await import("./full-book-export-cleanup");
  const ledger = validateCleanupLedger(record.cleanup, record); if (!ledger.length) return;
  const queue = getAudiobookQueue(); if (!queue) throw new Error("Export cleanup queue is unavailable.");
  for (const entry of ledger) {
    const jobId = `${record.id}-cleanup-${entry.manifest.attemptId}`, data = { ...record, cleanup: [entry] };
    const existing = await queue.getJob(jobId);
    if (existing) {
      if (existing.name !== "export-cleanup" || identity(existing.data as ExportJobRecord) !== identity(record) || JSON.stringify(validateCleanupLedger(existing.data.cleanup, record)) !== JSON.stringify([entry])) throw new Error("Export cleanup queue identity mismatch.");
      continue;
    }
    await queue.add("export-cleanup", data, { jobId, delay: Math.max(0, entry.cleanupAfter - Date.now()), attempts: 10, backoff: { type: "exponential", delay: 60000 }, removeOnComplete: false, removeOnFail: false });
  }
}
