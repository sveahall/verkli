-- Add audio_path column to audiobook_assets for storing storage object paths
-- instead of public URLs. During migration both columns coexist; audio_url
-- will be removed in a follow-up once all readers switch to signed URLs.

ALTER TABLE public.audiobook_assets
  ADD COLUMN IF NOT EXISTS audio_path text;

COMMENT ON COLUMN public.audiobook_assets.audio_path IS
  'Storage object path (e.g. bookId/audiobook-123.wav). Never a public URL.';
