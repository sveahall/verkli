/**
 * BullMQ import queue. Uses REDIS_URL from env.
 * If REDIS_URL is missing, enqueue is skipped and null is returned (API still creates import record).
 */

import { Queue } from "bullmq";
import { getRedisConnectionOptions, getRedisUrl } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue-names";

const QUEUE_NAME = QUEUE_NAMES.IMPORT;

function createQueue(connection: { host: string; port: number; password?: string }): Queue {
  return new Queue(QUEUE_NAME, {
    connection: {
      host: connection.host,
      port: connection.port,
      password: connection.password,
    },
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
    },
  });
}

let queueInstance: Queue | null = null;
let queueConnectionKey: string | null = null;

function getConnectionKey(connection: { host: string; port: number; password?: string }): string {
  return `${connection.host}:${connection.port}:${connection.password ?? ""}`;
}

export function getImportQueue(): Queue | null {
  const connection = getRedisConnectionOptions();
  if (!connection) return null;

  const key = getConnectionKey(connection);
  if (!queueInstance || queueConnectionKey !== key) {
    if (queueInstance) {
      void queueInstance.close().catch((err) => {
        console.error("[import queue] failed to close previous queue instance:", err);
      });
    }
    queueInstance = createQueue(connection);
    queueConnectionKey = key;
  }
  return queueInstance;
}

export type ExtractJobData = {
  importId: string;
  filePath: string;
  fileStorage: "local" | "supabase";
  authorId: string;
};

export async function enqueueExtractJob(data: ExtractJobData): Promise<string | null> {
  const url = getRedisUrl();
  if (!url || url.trim() === "") {
    console.warn("[import queue] REDIS_URL not set — job not enqueued. Import record created; set REDIS_URL and run worker to process.");
    return null;
  }
  const q = getImportQueue();
  if (!q) {
    console.warn("[import queue] Redis not reachable (invalid REDIS_URL?) — job not enqueued. Import record created; fix REDIS_URL and run worker.");
    return null;
  }

  try {
    const job = await q.add("extract", data, { jobId: data.importId });
    const jobId = job.id ?? null;
    if (jobId) {
      console.log("[import queue] Job enqueued:", jobId, "importId:", data.importId);
    }
    return jobId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("job") && msg.toLowerCase().includes("exists")) {
      const existing = await q.getJob(data.importId);
      const existingId = existing?.id ?? null;
      console.warn("[import queue] duplicate enqueue ignored, using existing job:", existingId ?? data.importId);
      return existingId;
    }
    console.error("[import queue] failed to enqueue extract job:", msg, "importId:", data.importId);
    throw err;
  }
}
