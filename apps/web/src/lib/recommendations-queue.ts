/**
 * BullMQ recommendations queue.
 * Used by the recommendations-worker to compute personalized book recommendations.
 */

import { Queue } from "bullmq";
import { getRedisConnectionOptions, getRedisUrl } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue-names";

const QUEUE_NAME = QUEUE_NAMES.RECOMMENDATIONS;

function createQueue(connection: { host: string; port: number; password?: string }): Queue {
  return new Queue(QUEUE_NAME, {
    connection: { ...connection },
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 200 },
    },
  });
}

let queueInstance: Queue | null = null;
let queueConnectionKey: string | null = null;

function getConnectionKey(connection: { host: string; port: number; password?: string }): string {
  return JSON.stringify(connection);
}

function getRecommendationsQueue(): Queue | null {
  const connection = getRedisConnectionOptions();
  if (!connection) return null;

  const key = getConnectionKey(connection);
  if (!queueInstance || queueConnectionKey !== key) {
    if (queueInstance) {
      void queueInstance.close().catch((err) => {
        console.error("[recommendations queue] failed to close previous queue instance:", err);
      });
    }
    queueInstance = createQueue(connection);
    queueConnectionKey = key;
  }
  return queueInstance;
}

export type RecommendationsJobData = {
  userId: string;
  trigger: "scheduled" | "signal" | "manual";
};

/**
 * Enqueue a recommendations computation job.
 * Returns the BullMQ job ID or null if queue unavailable.
 */
export async function enqueueRecommendationsJob(data: RecommendationsJobData): Promise<string | null> {
  const url = getRedisUrl();
  if (!url || url.trim() === "") {
    console.warn("[recommendations queue] REDIS_URL not set — job not enqueued.");
    return null;
  }

  const q = getRecommendationsQueue();
  if (!q) {
    console.warn("[recommendations queue] Redis not reachable — job not enqueued.");
    return null;
  }

  const jobId = `rec-${data.userId}-${data.trigger}`;

  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      try {
        await existing.remove();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[recommendations queue] could not remove previous job:", jobId, msg);
      }
    } else {
      return existing.id ?? null;
    }
  }

  const job = await q.add("compute", data, { jobId });
  return job.id ?? null;
}
