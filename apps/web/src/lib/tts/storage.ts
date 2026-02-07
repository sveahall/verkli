/**
 * Audio storage buckets and logging.
 * - Audiobook worker outputs: AUDIOBOOK_STORAGE_BUCKET (default: audiobooks)
 * - TTS outputs: TTS_STORAGE_BUCKET (default: tts-outputs)
 */

const DEFAULT_AUDIOBOOK_BUCKET = "audiobooks";
const DEFAULT_TTS_BUCKET = "tts-outputs";

let logged = false;

export function getAudiobookStorageBucket(): string {
  return (process.env.AUDIOBOOK_STORAGE_BUCKET ?? DEFAULT_AUDIOBOOK_BUCKET).trim() || DEFAULT_AUDIOBOOK_BUCKET;
}

export function getTtsStorageBucket(): string {
  const bucket = (process.env.TTS_STORAGE_BUCKET ?? DEFAULT_TTS_BUCKET).trim() || DEFAULT_TTS_BUCKET;
  if (!logged) {
    console.log("[audio] Storage buckets", {
      AUDIOBOOK_STORAGE_BUCKET: getAudiobookStorageBucket(),
      TTS_STORAGE_BUCKET: bucket,
    });
    logged = true;
  }
  return bucket;
}
