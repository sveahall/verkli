import "server-only";
import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue-names";

export type ImportQueueDiagnostic = {
  availability: "available" | "missing" | "unavailable";
  state: string | null;
  attemptsMade: number | null;
};
export type ImportDiagnostic = {
  id: string;
  status: string;
  progress: number | null;
  createdAt: string;
  updatedAt: string;
  queue: ImportQueueDiagnostic;
};
const states = new Set(["active", "completed", "delayed", "failed", "paused", "prioritized", "waiting", "waiting-children"]);

/** Read-only, exact ID lookup. Never return job.data, stack traces or failedReason. */
export async function loadImportQueueDiagnostic(id: string): Promise<ImportQueueDiagnostic> {
  const unavailable: ImportQueueDiagnostic = { availability: "unavailable", state: null, attemptsMade: null };
  const connection = getRedisConnectionOptions();
  if (!connection) return unavailable;
  const queue = new Queue(QUEUE_NAMES.IMPORT, {
    connection: { ...connection, connectTimeout: 1500, commandTimeout: 2000, maxRetriesPerRequest: 1, retryStrategy: () => null },
    skipMetasUpdate: true,
  });
  queue.on("error", () => {}); // Controlled diagnostic below; never log Redis URLs or payloads.
  try {
    const job = await queue.getJob(id);
    if (!job) return { availability: "missing", state: null, attemptsMade: null };
    const state = await job.getState();
    return { availability: "available", state: states.has(state) ? state : "unknown",
      attemptsMade: Number.isSafeInteger(job.attemptsMade) && job.attemptsMade >= 0 ? job.attemptsMade : null };
  } catch {
    console.warn("[admin import diagnostics] queue lookup unavailable", { importId: id });
    return unavailable;
  } finally {
    await queue.close().catch(() => {});
  }
}
