import { QUEUE_NAMES, type QueueName } from "@/lib/queue-names";

export type QueueRetryPolicy = {
  attempts: number;
  backoffDelayMs: number;
  removeOnCompleteCount: number;
  removeOnFailCount?: number;
};

export type QueueDescriptor<JobName extends string> = {
  queueName: QueueName;
  logPrefix: string;
  jobNames: readonly JobName[];
  retryPolicy: QueueRetryPolicy;
};

export const IMPORT_QUEUE_DESCRIPTOR = {
  queueName: QUEUE_NAMES.IMPORT,
  logPrefix: "[import queue]",
  jobNames: ["extract"] as const,
  retryPolicy: {
    attempts: 2,
    backoffDelayMs: 2_000,
    removeOnCompleteCount: 500,
  },
} satisfies QueueDescriptor<"extract">;

export const TRANSLATION_QUEUE_DESCRIPTOR = {
  queueName: QUEUE_NAMES.TRANSLATION,
  logPrefix: "[translation queue]",
  jobNames: ["translate"] as const,
  retryPolicy: {
    attempts: 3,
    backoffDelayMs: 5_000,
    removeOnCompleteCount: 500,
    removeOnFailCount: 500,
  },
} satisfies QueueDescriptor<"translate">;

export const AUDIOBOOK_QUEUE_DESCRIPTOR = {
  queueName: QUEUE_NAMES.AUDIOBOOK,
  logPrefix: "[audiobook queue]",
  jobNames: ["generate"] as const,
  retryPolicy: {
    attempts: 3,
    backoffDelayMs: 10_000,
    removeOnCompleteCount: 100,
    removeOnFailCount: 100,
  },
} satisfies QueueDescriptor<"generate">;

export const SOCIAL_PUBLISH_QUEUE_DESCRIPTOR = {
  queueName: QUEUE_NAMES.SOCIAL_PUBLISH,
  logPrefix: "[social-publish queue]",
  jobNames: ["publish"] as const,
  retryPolicy: {
    attempts: 2,
    backoffDelayMs: 5_000,
    removeOnCompleteCount: 100,
    removeOnFailCount: 100,
  },
} satisfies QueueDescriptor<"publish">;

export const RECOMMENDATIONS_QUEUE_DESCRIPTOR = {
  queueName: QUEUE_NAMES.RECOMMENDATIONS,
  logPrefix: "[recommendations queue]",
  jobNames: ["compute"] as const,
  retryPolicy: {
    attempts: 2,
    backoffDelayMs: 5_000,
    removeOnCompleteCount: 200,
    removeOnFailCount: 200,
  },
} satisfies QueueDescriptor<"compute">;

export const MARKETING_QUEUE_DESCRIPTOR = {
  queueName: QUEUE_NAMES.MARKETING,
  logPrefix: "[marketing queue]",
  jobNames: [
    "marketing-generate",
    "trailer-build",
    "marketing-video-generate",
    "text-to-video",
  ] as const,
  retryPolicy: {
    attempts: 2,
    backoffDelayMs: 5_000,
    removeOnCompleteCount: 500,
    removeOnFailCount: 500,
  },
} satisfies QueueDescriptor<
  "marketing-generate" | "trailer-build" | "marketing-video-generate" | "text-to-video"
>;
