/**
 * TTS Storage: bucket name and logging.
 * Bucket is configurable via TTS_STORAGE_BUCKET (default: audiobooks).
 */

const DEFAULT_BUCKET = "audiobooks";

let logged = false;

export function getTtsStorageBucket(): string {
  const bucket = (process.env.TTS_STORAGE_BUCKET ?? DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;
  if (!logged) {
    console.log("[tts] Storage bucket", { TTS_STORAGE_BUCKET: bucket });
    logged = true;
  }
  return bucket;
}
