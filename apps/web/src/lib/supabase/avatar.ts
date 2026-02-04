import { createClient } from "./server";
import { AVATARS_BUCKET_PUBLIC } from "./config";

/**
 * Resolve avatar_path (stored in profiles.avatar_url) to displayable URL.
 * Server-side only. Use on settings/profile pages.
 * - If bucket is public: uses getPublicUrl
 * - If bucket is private: generates signed URL
 */
export async function getAvatarUrlFromPathServer(
  avatarPath: string | null
): Promise<string | null> {
  if (!avatarPath || typeof avatarPath !== "string" || avatarPath.trim() === "")
    return null;
  if (avatarPath.startsWith("http://") || avatarPath.startsWith("https://"))
    return avatarPath;

  const supabase = await createClient();
  const bucket = supabase.storage.from("avatars");
  if (AVATARS_BUCKET_PUBLIC) {
    const { data } = bucket.getPublicUrl(avatarPath);
    return data.publicUrl;
  }
  const { data, error } = await bucket.createSignedUrl(avatarPath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
