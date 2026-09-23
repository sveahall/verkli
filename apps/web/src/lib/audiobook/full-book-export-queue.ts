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
  await queue.add("export", record, { jobId: record.id, attempts: 3, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } });
}
