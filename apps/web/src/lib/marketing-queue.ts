/**
 * BullMQ marketing queue. Uses same REDIS_URL as other queues.
 * If REDIS_URL is missing, enqueue is skipped and null is returned.
 */

import { Queue } from "bullmq";
import { getRedisConnectionOptions, getRedisUrl } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue-names";
import { makeJobId } from "@/lib/workers/idempotency";

const QUEUE_NAME = QUEUE_NAMES.MARKETING;

function createQueue(connection: { host: string; port: number; password?: string }): Queue {
  return new Queue(QUEUE_NAME, {
    connection: {
      host: connection.host,
      port: connection.port,
      password: connection.password,
    },
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  });
}

let queueInstance: Queue | null = null;
let queueConnectionKey: string | null = null;

function getConnectionKey(connection: { host: string; port: number; password?: string }): string {
  return `${connection.host}:${connection.port}:${connection.password ?? ""}`;
}

export function getMarketingQueue(): Queue | null {
  const connection = getRedisConnectionOptions();
  if (!connection) return null;

  const key = getConnectionKey(connection);
  if (!queueInstance || queueConnectionKey !== key) {
    if (queueInstance) {
      void queueInstance.close().catch((err: unknown) => {
        console.error("[marketing queue] failed to close previous queue instance:", err);
      });
    }
    queueInstance = createQueue(connection);
    queueConnectionKey = key;
  }
  return queueInstance;
}

export type MarketingJobData = {
  bookId: string;
  authorId: string;
  channels: string[];
  language: string;
  campaignId?: string;
};

export async function enqueueMarketingJob(data: MarketingJobData): Promise<string | null> {
  const url = getRedisUrl();
  if (!url || url.trim() === "") {
    console.warn("[marketing queue] REDIS_URL not set — job not enqueued.");
    return null;
  }
  const q = getMarketingQueue();
  if (!q) {
    console.warn("[marketing queue] Redis not reachable (invalid REDIS_URL?) — job not enqueued.");
    return null;
  }

  const jobId = makeJobId("marketing", data.authorId, data.bookId, data.language);
  const existing = await q.getJob(jobId);

  if (existing) {
    const state = await existing.getState();
    console.info("[marketing queue] existing job", jobId, "state:", state);

    if (state === "active") {
      console.warn("[marketing queue] job is actively processing, cannot re-enqueue:", jobId);
      return existing.id ?? null;
    }
    // completed, failed, waiting, delayed — remove to allow re-enqueue
    try {
      await existing.remove();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[marketing queue] could not remove old job before re-enqueue:", jobId, msg);
      if (state === "waiting" || state === "delayed") {
        return existing.id ?? null;
      }
    }
  }

  try {
    const job = await q.add("marketing-generate", data, { jobId });
    const id = job.id ?? null;
    if (id) {
      console.info(
        "[marketing queue] Job enqueued:",
        id,
        "bookId:",
        data.bookId,
        "authorId:",
        data.authorId,
        "channels:",
        data.channels.join(","),
        "language:",
        data.language
      );
    }
    return id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("job") && msg.toLowerCase().includes("exists")) {
      const dup = await q.getJob(jobId);
      const dupId = dup?.id ?? null;
      console.warn("[marketing queue] duplicate enqueue ignored, using existing job:", dupId ?? jobId);
      return dupId;
    }
    console.error(
      "[marketing queue] failed to enqueue job:",
      msg,
      "bookId:",
      data.bookId,
      "language:",
      data.language
    );
    throw err;
  }
}
