/**
 * BullMQ audiobook generation queue.
 * Uses same REDIS_URL as import/translation queues.
 * Job tracking uses existing ai_jobs table with kind='audiobook_generation'.
 */

import { Queue } from "bullmq";
import { getRedisConnectionOptions, getRedisUrl } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue-names";

const QUEUE_NAME = QUEUE_NAMES.AUDIOBOOK;

function createQueue(connection: { host: string; port: number; password?: string }): Queue {
  return new Queue(QUEUE_NAME, {
    connection: {
      host: connection.host,
      port: connection.port,
      password: connection.password,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
}

let queueInstance: Queue | null = null;
let queueConnectionKey: string | null = null;

function getConnectionKey(connection: { host: string; port: number; password?: string }): string {
  return `${connection.host}:${connection.port}:${connection.password ?? ""}`;
}

export function getAudiobookQueue(): Queue | null {
  const connection = getRedisConnectionOptions();
  if (!connection) return null;

  const key = getConnectionKey(connection);
  if (!queueInstance || queueConnectionKey !== key) {
    if (queueInstance) {
      void queueInstance.close().catch((err) => {
        console.error("[audiobook queue] failed to close previous queue instance:", err);
      });
    }
    queueInstance = createQueue(connection);
    queueConnectionKey = key;
  }
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
  /** Optional single-chapter mode */
  chapterId?: string | null;
  /** Optional explicit chapter selection (single or multi-chapter scope). */
  chapterIds?: string[] | null;
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
      try {
        await existing.remove();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[audiobook queue] could not remove previous job before re-enqueue:", data.jobId, msg);
      }
    } else {
      // Job already queued/running
      console.log("[audiobook queue] Job already exists:", data.jobId, "state:", state);
      return existing.id ?? null;
    }
  }

  try {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("job") && msg.toLowerCase().includes("exists")) {
      const dup = await q.getJob(data.jobId);
      const dupId = dup?.id ?? null;
      console.warn("[audiobook queue] duplicate enqueue ignored, using existing job:", dupId ?? data.jobId);
      return dupId;
    }
    console.error("[audiobook queue] failed to enqueue job:", msg, "jobId:", data.jobId, "bookId:", data.bookId);
    throw err;
  }
}
