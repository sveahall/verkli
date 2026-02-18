/**
 * Audio storage buckets.
 * - Audiobook worker outputs: AUDIOBOOK_STORAGE_BUCKET (default: audiobooks)
 */

const DEFAULT_AUDIOBOOK_BUCKET = "audiobooks";

export function getAudiobookStorageBucket(): string {
  return (process.env.AUDIOBOOK_STORAGE_BUCKET ?? DEFAULT_AUDIOBOOK_BUCKET).trim() || DEFAULT_AUDIOBOOK_BUCKET;
}
