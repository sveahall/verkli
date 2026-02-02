/**
 * BullMQ translation queue. Uses same REDIS_URL as import queue.
 * If REDIS_URL is missing, enqueue is skipped and null is returned.
 */

import { Queue } from "bullmq";
import { getRedisConnectionOptions, getRedisUrl } from "@/lib/env";

const QUEUE_NAME = "book-translation";

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

export function getTranslationQueue(): Queue | null {
  if (!connection) return null;
  if (!queueInstance) queueInstance = createQueue();
  return queueInstance;
}

export type TranslationJobData = {
  originalBookId: string;
  targetLanguage: string;
};

export async function enqueueTranslationJob(data: TranslationJobData): Promise<string | null> {
  const url = getRedisUrl();
  if (!url || url.trim() === "") {
    console.warn("[translation queue] REDIS_URL not set — job not enqueued.");
    return null;
  }
  const q = getTranslationQueue();
  if (!q) {
    console.warn("[translation queue] Redis not reachable (invalid REDIS_URL?) — job not enqueued.");
    return null;
  }
  const jobId = `${data.originalBookId}-${data.targetLanguage}`;
  const job = await q.add("translate", data, { jobId });
  const id = job.id ?? null;
  if (id) {
    console.log("[translation queue] Job enqueued:", id, "originalBookId:", data.originalBookId, "targetLanguage:", data.targetLanguage);
  }
  return id;
}
