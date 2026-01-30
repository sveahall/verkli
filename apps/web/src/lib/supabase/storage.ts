'use client'

import { createClient } from './client'

const supabase = createClient()

// Upload book cover
export async function uploadBookCover(file: File, bookId: string) {
  const fileExt = file.name.split('.').pop()
  const fileName = `${bookId}/cover.${fileExt}`
  
  const { data, error } = await supabase.storage
    .from('book-covers')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: true,
    })

  if (error) return { url: null, error }

  const { data: { publicUrl } } = supabase.storage
    .from('book-covers')
    .getPublicUrl(fileName)

  return { url: publicUrl, error: null }
}

// Upload user avatar
export async function uploadAvatar(file: File, userId: string) {
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/avatar.${fileExt}`
  
  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: true,
    })

  if (error) return { url: null, error }

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(fileName)

  return { url: publicUrl, error: null }
}

// Upload chapter content/media
export async function uploadChapterMedia(file: File, bookId: string, chapterId: string) {
  const fileExt = file.name.split('.').pop()
  const fileName = `${bookId}/${chapterId}/${Date.now()}.${fileExt}`
  
  const { data, error } = await supabase.storage
    .from('chapter-media')
    .upload(fileName, file, {
      cacheControl: '3600',
    })

  if (error) return { url: null, error }

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
