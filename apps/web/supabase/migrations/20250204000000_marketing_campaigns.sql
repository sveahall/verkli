-- Marketing automation v0: marketing_campaigns table, RLS, updated_at trigger

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'scheduled', 'published')),
  channel text NOT NULL DEFAULT 'generic' CHECK (channel IN ('generic', 'tiktok', 'instagram', 'x')),
  headline text,
  caption text,
  cta text,
  hashtags text,
  share_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, language, channel)
);

CREATE INDEX IF NOT EXISTS marketing_campaigns_book_id_idx ON public.marketing_campaigns(book_id);

DROP TRIGGER IF EXISTS update_marketing_campaigns_updated_at ON public.marketing_campaigns;
CREATE TRIGGER update_marketing_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: owner only for all operations
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_campaigns_select ON public.marketing_campaigns;
CREATE POLICY marketing_campaigns_select ON public.marketing_campaigns
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = marketing_campaigns.book_id AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS marketing_campaigns_insert ON public.marketing_campaigns;
CREATE POLICY marketing_campaigns_insert ON public.marketing_campaigns
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = marketing_campaigns.book_id AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS marketing_campaigns_update ON public.marketing_campaigns;
CREATE POLICY marketing_campaigns_update ON public.marketing_campaigns
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = marketing_campaigns.book_id AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS marketing_campaigns_delete ON public.marketing_campaigns;
CREATE POLICY marketing_campaigns_delete ON public.marketing_campaigns
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = marketing_campaigns.book_id AND b.author_id = auth.uid()
    )
  );

COMMENT ON TABLE public.marketing_campaigns IS 'Launch copy per book, language, channel – mock generated, no external posting';
