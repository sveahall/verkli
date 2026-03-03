/**
 * BullMQ social publish queue.
 * Job tracking uses existing ai_jobs table with kind='social_publish'.
 */

import { Queue } from "bullmq";
import { enqueueJob, getQueue } from "@/lib/queues/factory";
import { SOCIAL_PUBLISH_QUEUE_DESCRIPTOR } from "@/lib/queues/descriptors";

function getSocialPublishQueue(): Queue | null {
  return getQueue(SOCIAL_PUBLISH_QUEUE_DESCRIPTOR);
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
  return enqueueJob({
    descriptor: SOCIAL_PUBLISH_QUEUE_DESCRIPTOR,
    jobName: "publish",
    data,
    jobId: data.jobId,
    idempotency: {
      removeTerminalExisting: true,
    },
  });
}
