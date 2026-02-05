/**
 * Shared BullMQ queue names.
 * All workers and queue files should import from here.
 */

export const QUEUE_NAMES = {
  IMPORT: "book-import-extract",
  TRANSLATION: "book-translation",
  AUDIOBOOK: "audiobook-generation",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
