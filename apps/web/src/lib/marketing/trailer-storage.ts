/**
 * Marketing media storage: trailer uploads to bucket "marketing-media".
 * Path: trailers/{userId}/{assetId}.mp4
 * Bucket is public so getPublicUrl works for playback.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const MARKETING_MEDIA_BUCKET = "marketing-media";

/**
 * Storage path for a trailer: trailers/{userId}/{assetId}.mp4
 */
export function trailerStoragePath(userId: string, assetId: string): string {
  return `trailers/${userId}/${assetId}.mp4`;
}

/**
 * Upload trailer video to marketing-media bucket and return public URL.
 * Uses admin client (service role) so RLS does not block.
 */
export async function uploadTrailerAndGetPublicUrl(
  admin: SupabaseClient,
  userId: string,
  assetId: string,
  videoBuffer: ArrayBuffer | Buffer,
  contentType: string = "video/mp4"
): Promise<{ publicUrl: string } | { error: string }> {
  const path = trailerStoragePath(userId, assetId);

  const { error: uploadError } = await admin.storage
    .from(MARKETING_MEDIA_BUCKET)
    .upload(path, videoBuffer, {
      contentType,
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    console.error("[marketing-media] trailer upload failed", {
      path,
      message: uploadError.message,
    });
    return { error: uploadError.message };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(MARKETING_MEDIA_BUCKET).getPublicUrl(path);
  return { publicUrl };
}
