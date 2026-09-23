// Shared BullMQ stats loader for the admin surface.
//
// Used by both the admin dashboard (backlog summary) and the queues page
// (full per-queue table). Reads job counts + last failure for every
// production queue. Service-role connected; safe to call from server
// components only. Returns structured rows; never throws (per-queue errors
// are captured on the row).

import { Queue } from "bullmq";
import {
  AUDIOBOOK_QUEUE_DESCRIPTOR,
  IMPORT_QUEUE_DESCRIPTOR,
  MARKETING_QUEUE_DESCRIPTOR,
  RECOMMENDATIONS_QUEUE_DESCRIPTOR,
  SOCIAL_PUBLISH_QUEUE_DESCRIPTOR,
  TRANSLATION_QUEUE_DESCRIPTOR,
} from "@/lib/queues/descriptors";
import { QUEUE_NAMES } from "@/lib/queue-names";
import { getRedisConnectionOptions } from "@/lib/env";

const ALL_DESCRIPTORS = [
  IMPORT_QUEUE_DESCRIPTOR,
  TRANSLATION_QUEUE_DESCRIPTOR,
  AUDIOBOOK_QUEUE_DESCRIPTOR,
  SOCIAL_PUBLISH_QUEUE_DESCRIPTOR,
  RECOMMENDATIONS_QUEUE_DESCRIPTOR,
  MARKETING_QUEUE_DESCRIPTOR,
];

export type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
};

export type QueueRow = {
  name: string;
  jobNames: readonly string[];
  attempts: number;
  counts: QueueCounts | null;
  lastFailedReason: string | null;
  error: string | null;
};

export async function loadQueueRows(): Promise<QueueRow[]> {
  const connection = getRedisConnectionOptions();
  if (!connection) {
    return ALL_DESCRIPTORS.map((d) => ({
      name: d.queueName,
      jobNames: d.jobNames,
      attempts: d.retryPolicy.attempts,
      counts: null,
      lastFailedReason: null,
      error: "REDIS_URL not configured",
    }));
  }

  // Include `notifications` even though it has no descriptor (it's used by
  // the notifications worker). Reading queue stats does not require a
  // descriptor.
  const queueNames = [
    ...new Set([
      ...ALL_DESCRIPTORS.map((d) => d.queueName),
      QUEUE_NAMES.NOTIFICATIONS,
    ]),
  ];

  return Promise.all(
    queueNames.map(async (queueName): Promise<QueueRow> => {
      const descriptor = ALL_DESCRIPTORS.find((d) => d.queueName === queueName);
      const queue = new Queue(queueName, { connection: { ...connection } });
      try {
        const [counts, failed] = await Promise.all([
          queue.getJobCounts(
            "waiting",
            "active",
            "delayed",
            "completed",
            "failed",
            "paused"
          ),
          queue.getFailed(0, 0),
        ]);
        return {
          name: queueName,
          jobNames: descriptor?.jobNames ?? ([] as readonly string[]),
          attempts: descriptor?.retryPolicy.attempts ?? 0,
          counts: {
            waiting: Number(counts.waiting ?? 0),
            active: Number(counts.active ?? 0),
            delayed: Number(counts.delayed ?? 0),
            completed: Number(counts.completed ?? 0),
            failed: Number(counts.failed ?? 0),
            paused: Number(counts.paused ?? 0),
          },
          lastFailedReason: failed[0]?.failedReason ?? null,
          error: null,
        };
      } catch (err) {
        return {
          name: queueName,
          jobNames: descriptor?.jobNames ?? ([] as readonly string[]),
          attempts: descriptor?.retryPolicy.attempts ?? 0,
          counts: null,
          lastFailedReason: null,
          error: err instanceof Error ? err.message : String(err),
        };
      } finally {
        await queue.close().catch(() => {});
      }
    })
  );
}

export type QueueBacklog = {
  /** waiting + active across all queues, or null if Redis is unavailable. */
  pending: number | null;
  failed: number;
  redisAvailable: boolean;
};

export function summarizeBacklog(rows: QueueRow[]): QueueBacklog {
  const redisAvailable = rows.some((r) => r.counts !== null);
  if (!redisAvailable) {
    return { pending: null, failed: 0, redisAvailable: false };
  }
  let pending = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.counts) continue;
    pending += row.counts.waiting + row.counts.active;
    failed += row.counts.failed;
  }
  return { pending, failed, redisAvailable: true };
}
