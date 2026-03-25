/**
 * Queue metrics for observability: depth, failed, active (processing).
 * Used by health/workers and health/metrics/queue endpoints.
 */

import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "@/lib/env";
import { checkRedisHealth } from "@/lib/health/checks";
import { QUEUE_NAMES } from "@/lib/queue-names";
import { getQueue } from "@/lib/queues/factory";
import {
  IMPORT_QUEUE_DESCRIPTOR,
  TRANSLATION_QUEUE_DESCRIPTOR,
  AUDIOBOOK_QUEUE_DESCRIPTOR,
  SOCIAL_PUBLISH_QUEUE_DESCRIPTOR,
  RECOMMENDATIONS_QUEUE_DESCRIPTOR,
  MARKETING_QUEUE_DESCRIPTOR,
} from "@/lib/queues/descriptors";

export type QueueDepth = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

export type QueueStatus = {
  queueName: string;
  depth: QueueDepth | null;
  error?: string;
};

export async function getQueueDepths(): Promise<{
  redis: boolean;
  queues: Record<string, QueueStatus>;
}> {
  const redisOk = await checkRedisHealth();
  const connection = getRedisConnectionOptions();

  const queues: Record<string, QueueStatus> = {
    [QUEUE_NAMES.IMPORT]: { queueName: QUEUE_NAMES.IMPORT, depth: null },
    [QUEUE_NAMES.TRANSLATION]: { queueName: QUEUE_NAMES.TRANSLATION, depth: null },
    [QUEUE_NAMES.AUDIOBOOK]: { queueName: QUEUE_NAMES.AUDIOBOOK, depth: null },
    [QUEUE_NAMES.RECOMMENDATIONS]: { queueName: QUEUE_NAMES.RECOMMENDATIONS, depth: null },
    [QUEUE_NAMES.MARKETING]: { queueName: QUEUE_NAMES.MARKETING, depth: null },
    [QUEUE_NAMES.SOCIAL_PUBLISH]: { queueName: QUEUE_NAMES.SOCIAL_PUBLISH, depth: null },
    [QUEUE_NAMES.NOTIFICATIONS]: { queueName: QUEUE_NAMES.NOTIFICATIONS, depth: null },
  };

  if (!redisOk || !connection) {
    return { redis: redisOk, queues };
  }

  const descriptors = [
    IMPORT_QUEUE_DESCRIPTOR,
    TRANSLATION_QUEUE_DESCRIPTOR,
    AUDIOBOOK_QUEUE_DESCRIPTOR,
    SOCIAL_PUBLISH_QUEUE_DESCRIPTOR,
    RECOMMENDATIONS_QUEUE_DESCRIPTOR,
    MARKETING_QUEUE_DESCRIPTOR,
  ] as const;

  for (const descriptor of descriptors) {
    const queue = getQueue(descriptor);
    if (!queue) {
      queues[descriptor.queueName].error = "Queue not available";
      continue;
    }
    try {
      const counts = await queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed"
      );
      queues[descriptor.queueName].depth = {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
    } catch (err) {
      queues[descriptor.queueName].error =
        err instanceof Error ? err.message : String(err);
    }
  }

  const notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, {
    connection: { ...connection },
  });
  try {
    const counts = await notificationsQueue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed"
    );
    queues[QUEUE_NAMES.NOTIFICATIONS].depth = {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
    };
  } catch (err) {
    queues[QUEUE_NAMES.NOTIFICATIONS].error =
      err instanceof Error ? err.message : String(err);
  } finally {
    await notificationsQueue.close().catch(() => {});
  }

  return { redis: redisOk, queues };
}

/** Per-queue metrics shape for alerting: queue depth, failed jobs, processing jobs. */
export type QueueMetricsEntry = {
  queueDepth: number;
  failedJobs: number;
  processingJobs: number;
};

export type QueueMetricsResult = {
  queues: Record<string, QueueMetricsEntry>;
  totals: QueueMetricsEntry;
  redis: boolean;
  timestamp: string;
};

export function toQueueMetrics(
  redis: boolean,
  queues: Record<string, QueueStatus>
): QueueMetricsResult {
  const entries: Record<string, QueueMetricsEntry> = {};
  let totalDepth = 0;
  let totalFailed = 0;
  let totalProcessing = 0;

  for (const [name, status] of Object.entries(queues)) {
    if (status.error || !status.depth) {
      entries[name] = { queueDepth: 0, failedJobs: 0, processingJobs: 0 };
      continue;
    }
    const d = status.depth;
    const queueDepth = d.waiting + d.delayed;
    const failedJobs = d.failed;
    const processingJobs = d.active;
    entries[name] = { queueDepth, failedJobs, processingJobs };
    totalDepth += queueDepth;
    totalFailed += failedJobs;
    totalProcessing += processingJobs;
  }

  return {
    queues: entries,
    totals: {
      queueDepth: totalDepth,
      failedJobs: totalFailed,
      processingJobs: totalProcessing,
    },
    redis,
    timestamp: new Date().toISOString(),
  };
}
