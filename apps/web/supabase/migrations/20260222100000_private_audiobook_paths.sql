-- Private audiobook assets: persist storage paths (never public URLs)

ALTER TABLE public.audiobook_assets
  ADD COLUMN IF NOT EXISTS audio_path text,
  ADD COLUMN IF NOT EXISTS audio_bucket text;

-- Backfill only when legacy value already looks like a storage object path.
UPDATE public.audiobook_assets
SET
  audio_path = COALESCE(audio_path, audio_url),
  audio_bucket = COALESCE(audio_bucket, 'audiobooks')
WHERE
  audio_path IS NULL
  AND audio_url IS NOT NULL
  AND audio_url !~* '^https?://';

ALTER TABLE public.audiobook_assets
  DROP CONSTRAINT IF EXISTS audiobook_assets_audio_path_not_url;

ALTER TABLE public.audiobook_assets
  ADD CONSTRAINT audiobook_assets_audio_path_not_url
  CHECK (audio_path IS NULL OR audio_path !~* '^https?://');

-- Audiobooks must not be publicly readable; routes serve signed URLs.
UPDATE storage.buckets
SET public = false
WHERE id = 'audiobooks';

DROP POLICY IF EXISTS storage_audio_outputs_select_public ON storage.objects;
CREATE POLICY storage_audio_outputs_select_public ON storage.objects
  FOR SELECT
  USING (bucket_id = 'tts-outputs');
