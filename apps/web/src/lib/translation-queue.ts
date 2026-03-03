/**
 * BullMQ translation queue. Uses same REDIS_URL as import queue.
 * If REDIS_URL is missing, enqueue is skipped and null is returned.
 */

import { Queue } from "bullmq";
import { getQueue, enqueueJob } from "@/lib/queues/factory";
import { TRANSLATION_QUEUE_DESCRIPTOR } from "@/lib/queues/descriptors";

export function getTranslationQueue(): Queue | null {
  return getQueue(TRANSLATION_QUEUE_DESCRIPTOR);
}

export type TranslationJobData = {
  bookId: string;
  sourceVersionId: string;
  targetLanguage: string;
  targetVersionId?: string | null;
  overwrite?: boolean;
  authorId?: string;
  /** Optional single-chapter translation mode */
  chapterId?: string | null;
};

export async function enqueueTranslationJob(data: TranslationJobData): Promise<string | null> {
  const chapterSuffix =
    typeof data.chapterId === "string" && data.chapterId.trim().length > 0
      ? `-${data.chapterId.trim()}`
      : "";
  const jobId = `${data.bookId}-${data.targetLanguage}${chapterSuffix}`;
  const queuedId = await enqueueJob({
    descriptor: TRANSLATION_QUEUE_DESCRIPTOR,
    jobName: "translate",
    data,
    jobId,
    idempotency: {
      allowQueuedOverwrite: data.overwrite === true,
      removeTerminalExisting: true,
    },
  });
  if (queuedId) {
    console.log(
      "[translation queue] Job enqueued:",
      queuedId,
      "bookId:",
      data.bookId,
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
  return queuedId;
}
