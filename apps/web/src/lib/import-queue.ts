/**
 * BullMQ import queue. Uses REDIS_URL from env.
 * If REDIS_URL is missing, enqueue is skipped and null is returned (API still creates import record).
 */

import { Queue } from "bullmq";
import { getRedisConnectionOptions, getRedisUrl } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue-names";

const QUEUE_NAME = QUEUE_NAMES.IMPORT;

const connection = getRedisConnectionOptions();

function createQueue(): Queue | null {
  if (!connection) return null;
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

export function getImportQueue(): Queue | null {
  if (!connection) return null;
  if (!queueInstance) queueInstance = createQueue();
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
  const job = await q.add("extract", data, { jobId: data.importId });
  const jobId = job.id ?? null;
  if (jobId) {
    console.log("[import queue] Job enqueued:", jobId, "importId:", data.importId);
  }
  return jobId;
}
