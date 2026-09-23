-- Marketing RLS hardening: explicit ownership and service-role-only cache.
-- marketing_assets: all policies explicitly restrict via books.author_id = auth.uid().
-- marketing_caption_cache: no row-level policies; service role only (bypasses RLS).

-- Ensure marketing_assets SELECT only returns rows where the book is owned by current user
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

-- marketing_caption_cache: RLS enabled, no policies. Only service role can read/write.
COMMENT ON TABLE public.marketing_caption_cache IS 'Caption cache by content hash; service-role only (no RLS policies).';
