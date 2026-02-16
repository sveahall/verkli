"use client";

import { createClient } from "./client";
import { AVATARS_BUCKET_PUBLIC } from "./config";

const supabase = createClient();

const BOOK_COVERS_BUCKET = "book_covers";

/**
 * Upload book cover. Path must start with auth.uid() for RLS.
 * Returns public URL on success.
 */
export async function uploadBookCover(
  file: File,
  userId: string,
  bookId: string
): Promise<{ url: string | null; error: { message: string } | null }> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${bookId}/cover.${ext}`;

  const { error } = await supabase.storage
    .from(BOOK_COVERS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[uploadBookCover failed]", error);
    }
    return { url: null, error: { message: error.message } };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BOOK_COVERS_BUCKET).getPublicUrl(path);
  return { url: publicUrl, error: null };
}

/**
 * Resolve avatar_path from DB to a displayable URL.
 * - If bucket is public: uses getPublicUrl
 * - If bucket is private: generates signed URL
 * Use from client with createClient(); for server use getAvatarUrlFromPathServer from avatar.ts
 */
export async function getAvatarUrlFromPath(
  avatarPath: string | null,
  supabaseClient: {
    storage: {
      from: (b: string) => {
        getPublicUrl: (p: string) => { data: { publicUrl: string } };
        createSignedUrl: (
          p: string,
          n: number
        ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
      };
    };
  }
): Promise<string | null> {
  if (!avatarPath || typeof avatarPath !== "string" || avatarPath.trim() === "")
    return null;
  // Legacy: if it's a full URL, return as-is
  if (avatarPath.startsWith("http://") || avatarPath.startsWith("https://"))
    return avatarPath;

  const bucket = supabaseClient.storage.from("avatars");
  if (AVATARS_BUCKET_PUBLIC) {
    const { data } = bucket.getPublicUrl(avatarPath);
    return data.publicUrl;
  }
  const { data, error } = await bucket.createSignedUrl(avatarPath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

// Upload user avatar to avatars bucket, path: ${userId}/avatar.${ext} (replaces existing)
export async function uploadAvatar(file: File, userId: string) {
  const fileExt = file.name.split(".").pop() || "png";
  const path = `${userId}/avatar.${fileExt}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[avatar upload failed]", error);
    }
    return { path: null, url: null, error };
  }

  const { data: { publicUrl } } = supabase.storage
    .from("avatars")
    .getPublicUrl(path);

  return { path, url: publicUrl, error: null };
}

// Upload chapter content/media
export async function uploadChapterMedia(file: File, bookId: string, chapterId: string) {
  const fileExt = file.name.split('.').pop()
  const fileName = `${bookId}/${chapterId}/${Date.now()}.${fileExt}`
  
  const { error } = await supabase.storage
    .from('chapter-media')
    .upload(fileName, file, {
      cacheControl: '3600',
    })

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[uploadChapterMedia failed]", error);
    }
    return { url: null, error };
  }

  const { data: { publicUrl } } = supabase.storage
    .from('chapter-media')
    .getPublicUrl(fileName)

  return { url: publicUrl, error: null }
}

// Delete file from storage
export async function deleteFile(bucket: string, path: string) {
  const { error } = await supabase.storage
    .from(bucket)
    .remove([path])
  
  return { error }
}
