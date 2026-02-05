/**
 * BullMQ audiobook generation queue.
 * Uses same REDIS_URL as import/translation queues.
 * Job tracking uses existing ai_jobs table with kind='audiobook_generation'.
 */

import { Queue } from "bullmq";
import { getRedisConnectionOptions, getRedisUrl } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue-names";

const QUEUE_NAME = QUEUE_NAMES.AUDIOBOOK;

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
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
}

let queueInstance: Queue | null = null;

export function getAudiobookQueue(): Queue | null {
  if (!connection) return null;
  if (!queueInstance) queueInstance = createQueue();
  return queueInstance;
}

export type AudiobookJobData = {
  /** ai_jobs.id - used as BullMQ job ID for deduplication */
  jobId: string;
  bookId: string;
  bookVersionId: string;
  userId: string;
  language: string;
  voiceId: string;
  modelPath: string;
};

/**
 * Enqueue an audiobook generation job.
 * Returns the BullMQ job ID (same as ai_jobs.id) or null if queue unavailable.
 */
export async function enqueueAudiobookJob(data: AudiobookJobData): Promise<string | null> {
  const url = getRedisUrl();
  if (!url || url.trim() === "") {
    console.warn("[audiobook queue] REDIS_URL not set — job not enqueued.");
    return null;
  }

  const q = getAudiobookQueue();
  if (!q) {
    console.warn("[audiobook queue] Redis not reachable — job not enqueued.");
    return null;
  }

  // Check for existing job with same ID (idempotency)
  const existing = await q.getJob(data.jobId);
  if (existing) {
    const state = await existing.getState();
    // If completed or failed, remove so we can re-enqueue
    if (state === "completed" || state === "failed") {
      await existing.remove();
    } else {
      // Job already queued/running
      console.log("[audiobook queue] Job already exists:", data.jobId, "state:", state);
      return existing.id ?? null;
    }
  }

  const job = await q.add("generate", data, { jobId: data.jobId });
  const id = job.id ?? null;

  if (id) {
    console.log(
      "[audiobook queue] Job enqueued:",
      id,
      "bookId:", data.bookId,
      "bookVersionId:", data.bookVersionId,
      "language:", data.language
    );
  }

  return id;
}
