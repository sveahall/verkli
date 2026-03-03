/**
 * BullMQ marketing queue. Uses same REDIS_URL as other queues.
 * If REDIS_URL is missing, enqueue is skipped and null is returned.
 */

import { Queue } from "bullmq";
import { makeJobId } from "@/lib/workers/idempotency";
import { enqueueJob, getQueue } from "@/lib/queues/factory";
import { MARKETING_QUEUE_DESCRIPTOR } from "@/lib/queues/descriptors";

export function getMarketingQueue(): Queue | null {
  return getQueue(MARKETING_QUEUE_DESCRIPTOR);
}

export type MarketingJobData = {
  bookId: string;
  authorId: string;
  channels: string[];
  language: string;
  campaignId?: string;
};

export type TrailerBuildJobData = {
  jobId: string;
  assetId: string;
  bookId: string;
  userId: string;
  coverImageUrl: string;
  trailerRequest: Record<string, unknown>;
};

export type MarketingVideoGenerateJobData = {
  jobId: string;
  assetId: string;
  bookId: string;
  userId: string;
  prompt: string;
  imageUrl: string;
  metadata?: Record<string, unknown> | null;
};

export type TextToVideoJobData = {
  jobId: string;
  userId: string;
  options: {
    promptText: string;
    duration?: 4 | 6 | 8;
    ratio?: "1280:720" | "720:1280" | "1080:1920" | "1920:1080";
    audio?: boolean;
  };
};

type MarketingQueueJobName =
  | "marketing-generate"
  | "trailer-build"
  | "marketing-video-generate"
  | "text-to-video";

async function enqueueNamedJob<T>(
  jobName: MarketingQueueJobName,
  jobId: string,
  data: T
): Promise<string | null> {
  return enqueueJob({
    descriptor: MARKETING_QUEUE_DESCRIPTOR,
    jobName,
    data,
    jobId,
    idempotency: {
      removeTerminalExisting: true,
    },
  });
}

export async function enqueueMarketingJob(data: MarketingJobData): Promise<string | null> {
  const jobId = makeJobId("marketing", data.authorId, data.bookId, data.language);
  const id = await enqueueNamedJob("marketing-generate", jobId, data);
  if (id) {
    console.log(
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
}

export async function enqueueTrailerBuildJob(
  data: TrailerBuildJobData
): Promise<string | null> {
  return enqueueNamedJob("trailer-build", data.jobId, data);
}

export async function enqueueMarketingVideoGenerateJob(
  data: MarketingVideoGenerateJobData
): Promise<string | null> {
  return enqueueNamedJob("marketing-video-generate", data.jobId, data);
}

export async function enqueueTextToVideoJob(
  data: TextToVideoJobData
): Promise<string | null> {
  return enqueueNamedJob("text-to-video", data.jobId, data);
}
