import { createClient } from "./server";
import { AVATARS_BUCKET_PUBLIC } from "./config";

const AVATARS_BUCKET = "avatars";

function isAbsoluteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function buildPublicAvatarUrl(avatarPath: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!base) return null;
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = avatarPath.replace(/^\/+/, "");
  return `${normalizedBase}/storage/v1/object/public/${AVATARS_BUCKET}/${normalizedPath}`;
}

/**
 * Resolve avatar_path (stored in profiles.avatar_url) to displayable URL.
 * Server-side only. Use on settings/profile pages.
 *
 * Public-bucket path is synchronous and allocates no Supabase client — avoid
 * spinning up an SSR client per caller in loops (home/discover/library).
 * Private-bucket path falls back to a signed URL.
 */
export async function getAvatarUrlFromPathServer(
  avatarPath: string | null
): Promise<string | null> {
  if (!avatarPath || typeof avatarPath !== "string" || avatarPath.trim() === "")
    return null;
  if (isAbsoluteUrl(avatarPath)) return avatarPath;

  if (AVATARS_BUCKET_PUBLIC) {
    return buildPublicAvatarUrl(avatarPath);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .createSignedUrl(avatarPath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
