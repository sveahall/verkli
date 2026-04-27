/**
 * BullMQ translation queue. Uses same REDIS_URL as import queue.
 *
 * Production (NODE_ENV === "production"):
 *   - missing REDIS_URL              → throws TranslationQueueUnavailableError
 *   - Redis connection unreachable   → throws TranslationQueueUnavailableError
 * Dev/test:
 *   - both cases above log a warning and return null (preserves existing dev DX)
 *
 * Callers must handle the error path explicitly. See CEO plan §C6.
 */

import { Queue } from "bullmq";
import { getRedisConnectionOptions, getRedisUrl } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue-names";

const QUEUE_NAME = QUEUE_NAMES.TRANSLATION;

export class TranslationQueueUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationQueueUnavailableError";
  }
}

function createQueue(connection: { host: string; port: number; password?: string }): Queue {
  return new Queue(QUEUE_NAME, {
    connection: { ...connection },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  });
}

let queueInstance: Queue | null = null;
let queueConnectionKey: string | null = null;

function getConnectionKey(connection: { host: string; port: number; password?: string }): string {
  return JSON.stringify(connection);
}

export function getTranslationQueue(): Queue | null {
  const connection = getRedisConnectionOptions();
  if (!connection) return null;

  const key = getConnectionKey(connection);
  if (!queueInstance || queueConnectionKey !== key) {
    if (queueInstance) {
      void queueInstance.close().catch((err) => {
        console.error("[translation queue] failed to close previous queue instance:", err);
      });
    }
    queueInstance = createQueue(connection);
    queueConnectionKey = key;
  }
  return queueInstance;
}

export type TranslationJobData = {
  bookId: string;
  sourceLanguage?: string | null;
  sourceVersionId: string;
  targetLanguage: string;
  targetVersionId?: string | null;
  overwrite?: boolean;
  authorId?: string;
  /** Optional single-chapter translation mode */
  chapterId?: string | null;
};

export async function enqueueTranslationJob(data: TranslationJobData): Promise<string | null> {
  const isProd = process.env.NODE_ENV === "production";

  const url = getRedisUrl();
  if (!url || url.trim() === "") {
    const msg = "[translation queue] REDIS_URL not set — translation job not enqueued";
    if (isProd) {
      throw new TranslationQueueUnavailableError(msg);
    }
    console.warn(`${msg} (dev: returning null)`);
    return null;
  }

  const q = getTranslationQueue();
  if (!q) {
    const msg = "[translation queue] Redis connection failed — translation job not enqueued";
    if (isProd) {
      throw new TranslationQueueUnavailableError(msg);
    }
    console.warn(`${msg} (dev: returning null)`);
    return null;
  }

  const chapterSuffix =
    typeof data.chapterId === "string" && data.chapterId.trim().length > 0
      ? `-${data.chapterId.trim()}`
      : "";
  const jobId = `${data.bookId}-${data.targetLanguage}${chapterSuffix}`;
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    console.info("[translation queue] existing job", jobId, "state:", state);

    if (state === "active") {
      // Job is actively processing — cannot safely remove.
      console.warn("[translation queue] job is actively processing, cannot re-enqueue:", jobId);
      return existing.id ?? null;
    }
    if (state === "waiting" || state === "delayed") {
      // Job is queued but not yet running.
      if (data.overwrite) {
        try {
          await existing.remove();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[translation queue] could not remove queued job before overwrite:", jobId, msg);
          return existing.id ?? null;
        }
      } else {
        return existing.id ?? null;
      }
    } else {
      // completed, failed, or unknown — always remove to allow re-enqueue.
      try {
        await existing.remove();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[translation queue] could not remove old job before re-enqueue:", jobId, msg);
      }
    }
  }
  try {
    const job = await q.add("translate", data, { jobId });
    const id = job.id ?? null;
    if (id) {
      console.info(
        "[translation queue] Job enqueued:",
        id,
        "bookId:",
        data.bookId,
        "sourceLanguage:",
        data.sourceLanguage ?? null,
        "sourceVersionId:",
        data.sourceVersionId,
        "targetLanguage:",
        data.targetLanguage,
        "chapterId:",
        data.chapterId ?? null,
        "overwrite:",
        data.overwrite ?? false
      );
    }
    return id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("job") && msg.toLowerCase().includes("exists")) {
      const dup = await q.getJob(jobId);
      const dupId = dup?.id ?? null;
      console.warn("[translation queue] duplicate enqueue ignored, using existing job:", dupId ?? jobId);
      return dupId;
    }
    console.error(
      "[translation queue] failed to enqueue job:",
      msg,
      "bookId:",
      data.bookId,
      "targetLanguage:",
      data.targetLanguage
    );
    throw err;
  }
}
