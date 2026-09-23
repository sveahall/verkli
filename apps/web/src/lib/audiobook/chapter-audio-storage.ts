import type { createAdminClient } from "../supabase/admin";
import type { AudioTiming } from "./timing";

type Input = {
  bucket: string; storagePath: string; audio: Buffer; chapterId: string; bookVersionId: string;
  contentHash: string; voiceId: string; modelPath: string; language: string; durationSeconds: number;
  contentType: string; timing: AudioTiming | null; smoke: boolean;
};

/** Publish the cache pointer only after its audio and optional timing are durable. */
export async function uploadChapterAudio(supabase: ReturnType<typeof createAdminClient>, input: Input) {
  const { bucket, storagePath, audio, chapterId, bookVersionId, timing } = input;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, audio, {
    contentType: input.contentType, upsert: true,
  });
  if (uploadError) throw new Error("[audiobook worker] Chapter audio upload failed");

  // Smoke audio must never enter the reusable cache or receive provider timing.
  if (input.smoke) return;
  if (timing) {
    const { error } = await supabase.storage.from(bucket).upload(`${storagePath}.timing.json`, JSON.stringify({
      version: 1, chapterId, bookVersionId, audioPath: storagePath, timing,
    }), { contentType: "application/json", upsert: true });
    if (error) throw new Error("[audiobook worker] Chapter timing upload failed");
  }

  const { error: cacheError } = await supabase.from("chapter_audio_cache").upsert({
    chapter_id: chapterId, book_version_id: bookVersionId, content_hash: input.contentHash,
    voice_id: input.voiceId, model_path: input.modelPath, language: input.language,
    audio_path: storagePath, duration_seconds: input.durationSeconds, file_size_bytes: audio.length,
  }, { onConflict: "chapter_id,content_hash,voice_id,model_path,language" });
  if (cacheError) throw new Error("[audiobook worker] Chapter audio cache update failed");
}
