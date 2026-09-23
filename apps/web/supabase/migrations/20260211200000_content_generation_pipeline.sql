-- Content generation pipeline: content_assets table, RLS, storage bucket

CREATE TABLE IF NOT EXISTS public.content_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id       uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type  text NOT NULL CHECK (content_type IN ('video', 'image', 'text')),
  channel       text NOT NULL CHECK (channel IN ('ig', 'tiktok', 'x', 'email', 'generic')),
  version       integer NOT NULL DEFAULT 1,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  visibility    text NOT NULL DEFAULT 'private'
                CHECK (visibility IN ('private', 'public')),
  -- Input snapshot
  prompt_template text,
  prompt_rendered text,
  config        jsonb NOT NULL DEFAULT '{}',
  -- Output
  asset_url     text,
  text_content  jsonb,
  metadata      jsonb DEFAULT '{}',
  error         text,
  -- Grounding
  book_snapshot jsonb,
  -- Timestamps
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, content_type, channel, version)
);

CREATE INDEX IF NOT EXISTS content_assets_book_id_idx
  ON public.content_assets(book_id);

CREATE INDEX IF NOT EXISTS content_assets_user_id_idx
  ON public.content_assets(user_id);

CREATE INDEX IF NOT EXISTS content_assets_book_type_channel_version_idx
  ON public.content_assets(book_id, content_type, channel, version DESC);

DROP TRIGGER IF EXISTS update_content_assets_updated_at ON public.content_assets;
CREATE TRIGGER update_content_assets_updated_at
  BEFORE UPDATE ON public.content_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: owner-only for all operations
ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_assets_select ON public.content_assets;
CREATE POLICY content_assets_select ON public.content_assets
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS content_assets_insert ON public.content_assets;
CREATE POLICY content_assets_insert ON public.content_assets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS content_assets_update ON public.content_assets;
CREATE POLICY content_assets_update ON public.content_assets
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS content_assets_delete ON public.content_assets;
CREATE POLICY content_assets_delete ON public.content_assets
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.content_assets IS 'AI-generated content (video, image, text) per book/channel with version history.';
COMMENT ON COLUMN public.content_assets.visibility IS 'Asset visibility: private (owner-only) or public (future reader access).';
COMMENT ON COLUMN public.content_assets.book_snapshot IS 'Frozen book data at generation time for audit and grounding.';

-- Storage bucket for content assets (images and videos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-assets',
  'content-assets',
  true,
  536870912,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies for content-assets bucket
DROP POLICY IF EXISTS storage_content_assets_select_public ON storage.objects;
CREATE POLICY storage_content_assets_select_public ON storage.objects
  FOR SELECT
  USING (bucket_id = 'content-assets');

DROP POLICY IF EXISTS storage_content_assets_insert_owner ON storage.objects;
CREATE POLICY storage_content_assets_insert_owner ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'content-assets'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS storage_content_assets_update_owner ON storage.objects;
CREATE POLICY storage_content_assets_update_owner ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'content-assets'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'content-assets'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS storage_content_assets_delete_owner ON storage.objects;
CREATE POLICY storage_content_assets_delete_owner ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'content-assets'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
