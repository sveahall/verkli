-- Trailer build pipeline: marketing-media bucket, public URL, metadata and cost on media_assets.

-- Bucket for final trailer videos: trailers/{userId}/{assetId}.mp4 (public read).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-media',
  'marketing-media',
  true,
  104857600,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read for marketing-media (getPublicUrl works).
DROP POLICY IF EXISTS storage_marketing_media_select ON storage.objects;
CREATE POLICY storage_marketing_media_select ON storage.objects
  FOR SELECT
  USING (bucket_id = 'marketing-media');

-- Insert/update/delete restricted to authenticated owner (path: trailers/{userId}/...).
DROP POLICY IF EXISTS storage_marketing_media_insert_owner ON storage.objects;
CREATE POLICY storage_marketing_media_insert_owner ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'marketing-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'trailers'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS storage_marketing_media_update_owner ON storage.objects;
CREATE POLICY storage_marketing_media_update_owner ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'marketing-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'trailers'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'marketing-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'trailers'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS storage_marketing_media_delete_owner ON storage.objects;
CREATE POLICY storage_marketing_media_delete_owner ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'marketing-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'trailers'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- media_assets: metadata (scenes, caption, hashtags, generation_time_ms) and cost estimate.
ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric;

COMMENT ON COLUMN public.media_assets.metadata IS 'Trailer metadata: scenes, caption, hashtags, generation_time_ms.';
COMMENT ON COLUMN public.media_assets.estimated_cost_usd IS 'Estimated generation cost in USD.';
