/**
 * BullMQ recommendations queue.
 * Used by the recommendations-worker to compute personalized book recommendations.
 */

import { Queue } from "bullmq";
import { enqueueJob, getQueue } from "@/lib/queues/factory";
import { RECOMMENDATIONS_QUEUE_DESCRIPTOR } from "@/lib/queues/descriptors";

function getRecommendationsQueue(): Queue | null {
  return getQueue(RECOMMENDATIONS_QUEUE_DESCRIPTOR);
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
  const jobId = `rec-${data.userId}-${data.trigger}`;
  return enqueueJob({
    descriptor: RECOMMENDATIONS_QUEUE_DESCRIPTOR,
    jobName: "compute",
    data,
    jobId,
    idempotency: {
      removeTerminalExisting: true,
    },
  });
}
