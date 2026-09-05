import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "@/lib/env";
import {
  AUDIOBOOK_QUEUE_DESCRIPTOR,
  IMPORT_QUEUE_DESCRIPTOR,
  MARKETING_QUEUE_DESCRIPTOR,
  RECOMMENDATIONS_QUEUE_DESCRIPTOR,
  SOCIAL_PUBLISH_QUEUE_DESCRIPTOR,
  TRANSLATION_QUEUE_DESCRIPTOR,
} from "./descriptors";
import { QUEUE_NAMES } from "@/lib/queue-names";

/**
 * Write actions for the admin queue dashboard.
 *
 * The dashboard has been read-only, which means a job that failed in a way
 * retrying would fix could not be retried from anywhere — the operator's only
 * options were a redeploy or a direct Redis session. That is a poor position to
 * discover on launch day.
 */

/**
 * The queues an admin may act on. An allowlist rather than a passthrough,
 * because `new Queue(name)` takes any string: an unvalidated name would let a
 * caller point BullMQ at arbitrary Redis keys in the shared instance.
 */
const ACTIONABLE_QUEUES: readonly string[] = [
  ...new Set([
    IMPORT_QUEUE_DESCRIPTOR.queueName,
    TRANSLATION_QUEUE_DESCRIPTOR.queueName,
    AUDIOBOOK_QUEUE_DESCRIPTOR.queueName,
    SOCIAL_PUBLISH_QUEUE_DESCRIPTOR.queueName,
    RECOMMENDATIONS_QUEUE_DESCRIPTOR.queueName,
    MARKETING_QUEUE_DESCRIPTOR.queueName,
    QUEUE_NAMES.NOTIFICATIONS,
  ]),
];

export function isActionableQueue(name: unknown): name is string {
  return typeof name === "string" && ACTIONABLE_QUEUES.includes(name);
}

export function listActionableQueues(): readonly string[] {
  return ACTIONABLE_QUEUES;
}

/**
 * Retrying is capped per call, and the cap is not a performance tweak.
 *
 * A queue that has been failing for a week can hold thousands of failed jobs.
 * Moving them all back to waiting inside one HTTP request would time out
 * halfway, having already re-queued an unknown number — leaving the operator
 * with no idea what state anything is in. A bounded batch that reports its own
 * count is re-runnable and always truthful.
 */
export const RETRY_BATCH_MAX = 50;

export type RetryFailedResult =
  | {
      ok: true;
      queueName: string;
      retried: number;
      failedToRetry: number;
      /** Null when the follow-up count failed; the retries above still happened. */
      remaining: number | null;
    }
  | { ok: false; queueName: string; error: string };

export async function retryFailedJobs(
  queueName: string,
  limit: number = RETRY_BATCH_MAX
): Promise<RetryFailedResult> {
  if (!isActionableQueue(queueName)) {
    return { ok: false, queueName, error: "UNKNOWN_QUEUE" };
  }

  const connection = getRedisConnectionOptions();
  if (!connection) {
    return { ok: false, queueName, error: "REDIS_URL not configured" };
  }

  const batch = Math.max(1, Math.min(RETRY_BATCH_MAX, Math.floor(limit) || RETRY_BATCH_MAX));
  const queue = new Queue(queueName, { connection: { ...connection } });

  try {
    const failed = await queue.getFailed(0, batch - 1);

    // Retried one at a time and counted separately, because a job can refuse to
    // move (already retried by someone else, or gone). Reporting the batch size
    // as the number retried would be a lie the operator acts on.
    let retried = 0;
    let failedToRetry = 0;
    for (const job of failed) {
      try {
        await job.retry();
        retried += 1;
      } catch (err) {
        failedToRetry += 1;
        console.error("[admin/queues] job retry failed", {
          queueName,
          jobId: job.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Counted in its own try. If this read fails AFTER jobs were requeued, the
    // outer catch would report a wholly failed action and skip the audit row —
    // for a queue that has in fact already been mutated. Losing the remaining
    // count is a small loss; telling the operator nothing moved is a large one.
    let remaining: number | null = null;
    try {
      const counts = await queue.getJobCounts("failed");
      remaining = Number(counts.failed ?? 0);
    } catch (err) {
      console.error("[admin/queues] post-retry count failed", {
        queueName,
        retried,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    return { ok: true, queueName, retried, failedToRetry, remaining };
  } catch (err) {
    return {
      ok: false,
      queueName,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await queue.close().catch(() => {});
  }
}
