/**
 * BullMQ social publish queue.
 * Job tracking uses existing ai_jobs table with kind='social_publish'.
 */

import { Queue } from "bullmq";
import { getRedisConnectionOptions, getRedisUrl } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue-names";

const QUEUE_NAME = QUEUE_NAMES.SOCIAL_PUBLISH;

function createQueue(connection: { host: string; port: number; password?: string }): Queue {
  return new Queue(QUEUE_NAME, {
    connection: {
      host: connection.host,
      port: connection.port,
      password: connection.password,
    },
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5_000 },
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

function getSocialPublishQueue(): Queue | null {
  const connection = getRedisConnectionOptions();
  if (!connection) return null;

  const key = getConnectionKey(connection);
  if (!queueInstance || queueConnectionKey !== key) {
    if (queueInstance) {
      void queueInstance.close().catch((err) => {
        console.error("[social-publish queue] failed to close previous queue instance:", err);
      });
    }
    queueInstance = createQueue(connection);
    queueConnectionKey = key;
  }
  return queueInstance;
}

export type SocialPublishJobData = {
  jobId: string;
  campaignId: string;
  bookId: string;
  userId: string;
  platforms: string[];
};

/**
 * Enqueue a social publish job.
 * Returns the BullMQ job ID or null if queue unavailable.
 */
export async function enqueueSocialPublishJob(data: SocialPublishJobData): Promise<string | null> {
  const url = getRedisUrl();
  if (!url || url.trim() === "") {
    console.warn("[social-publish queue] REDIS_URL not set — job not enqueued.");
    return null;
  }

  const q = getSocialPublishQueue();
  if (!q) {
    console.warn("[social-publish queue] Redis not reachable — job not enqueued.");
    return null;
  }

  const existing = await q.getJob(data.jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      try {
        await existing.remove();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[social-publish queue] could not remove previous job:", data.jobId, msg);
      }
    } else {
      return existing.id ?? null;
    }
  }

  const job = await q.add("publish", data, { jobId: data.jobId });
  return job.id ?? null;
}
