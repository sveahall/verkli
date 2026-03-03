/**
 * BullMQ import queue. Uses REDIS_URL from env.
 * If REDIS_URL is missing, enqueue is skipped and null is returned (API still creates import record).
 */

import { Queue } from "bullmq";
import { getQueue, enqueueJob } from "@/lib/queues/factory";
import { IMPORT_QUEUE_DESCRIPTOR } from "@/lib/queues/descriptors";

export type ImportMode = "new_version" | "overwrite_draft";

export function getImportQueue(): Queue | null {
  return getQueue(IMPORT_QUEUE_DESCRIPTOR);
}

export type ExtractJobData = {
  importId: string;
  filePath: string;
  fileStorage: "local" | "supabase";
  authorId: string;
  /** Optional scoped import target (BookEditor flow) */
  bookId?: string;
  /** Import strategy for scoped imports */
  mode?: ImportMode;
  /** Optional explicit draft version to overwrite */
  targetVersionId?: string | null;
};

export async function enqueueExtractJob(data: ExtractJobData): Promise<string | null> {
  const jobId = await enqueueJob({
    descriptor: IMPORT_QUEUE_DESCRIPTOR,
    jobName: "extract",
    data,
    jobId: data.importId,
    idempotency: {
      inspectExistingBeforeEnqueue: false,
      removeTerminalExisting: false,
    },
  });
  if (jobId) {
    console.log("[import queue] Job enqueued:", jobId, "importId:", data.importId);
  }
  return jobId;
}
