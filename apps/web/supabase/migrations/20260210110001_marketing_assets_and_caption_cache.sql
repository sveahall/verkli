-- Marketing caption portal: saved assets per book/channel/language and AI caption cache by content hash.

CREATE TABLE IF NOT EXISTS public.marketing_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('tiktok', 'instagram', 'x', 'facebook')),
  language text NOT NULL DEFAULT 'en',
  content_type text NOT NULL DEFAULT 'caption' CHECK (content_type IN ('hook', 'blurb', 'caption')),
  text text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_assets_book_id_idx ON public.marketing_assets(book_id);
CREATE INDEX IF NOT EXISTS marketing_assets_book_channel_lang_idx ON public.marketing_assets(book_id, channel, language);

ALTER TABLE public.marketing_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_assets_select ON public.marketing_assets;
CREATE POLICY marketing_assets_select ON public.marketing_assets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = marketing_assets.book_id AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS marketing_assets_insert ON public.marketing_assets;
CREATE POLICY marketing_assets_insert ON public.marketing_assets
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = marketing_assets.book_id AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS marketing_assets_update ON public.marketing_assets;
CREATE POLICY marketing_assets_update ON public.marketing_assets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = marketing_assets.book_id AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS marketing_assets_delete ON public.marketing_assets;
CREATE POLICY marketing_assets_delete ON public.marketing_assets
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = marketing_assets.book_id AND b.author_id = auth.uid()
    )
  );

-- Server-only cache: keyed by content hash to avoid re-generating same caption.
CREATE TABLE IF NOT EXISTS public.marketing_caption_cache (
  content_hash text PRIMARY KEY,
  caption_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_caption_cache ENABLE ROW LEVEL SECURITY;

-- No row-level policies: only service role (admin client) bypasses RLS and can read/write.

COMMENT ON TABLE public.marketing_assets IS 'Saved captions/copy per book, channel, language – author portal';
COMMENT ON TABLE public.marketing_caption_cache IS 'Cached generated captions by content hash; server-only access';