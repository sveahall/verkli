/**
 * BullMQ audiobook generation queue.
 * Uses same REDIS_URL as import/translation queues.
 * Job tracking uses existing ai_jobs table with kind='audiobook_generation'.
 */

import { Queue } from "bullmq";
import { enqueueJob, getQueue } from "@/lib/queues/factory";
import { AUDIOBOOK_QUEUE_DESCRIPTOR } from "@/lib/queues/descriptors";

export function getAudiobookQueue(): Queue | null {
  return getQueue(AUDIOBOOK_QUEUE_DESCRIPTOR);
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
  const id = await enqueueJob({
    descriptor: AUDIOBOOK_QUEUE_DESCRIPTOR,
    jobName: "generate",
    data,
    jobId: data.jobId,
    idempotency: {
      removeTerminalExisting: true,
    },
  });

  if (id) {
    console.log(
      "[audiobook queue] Job enqueued:",
      id,
      "bookId:",
      data.bookId,
      "bookVersionId:",
      data.bookVersionId,
      "language:",
      data.language
    );
  }
  return id;
}
