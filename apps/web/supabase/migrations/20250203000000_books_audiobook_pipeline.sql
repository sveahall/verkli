-- Audiobook pipeline v0: audiobook_status on books, audiobook_assets table, RLS

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS audiobook_status text DEFAULT 'not_started';

ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_audiobook_status_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_audiobook_status_check
  CHECK (audiobook_status IN ('not_started', 'ready', 'generating', 'published', 'failed'));

COMMENT ON COLUMN public.books.audiobook_status IS 'Audiobook workflow: not_started → ready → generating → published | failed';

-- ─────────────────────────────────────────────────────────────
-- Audiobook assets
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audiobook_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'failed')),
  audio_url text,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audiobook_assets_book_id_idx ON public.audiobook_assets(book_id);

COMMENT ON TABLE public.audiobook_assets IS 'One row per generated audiobook (mock or future TTS)';

-- RLS: SELECT public for assets of published books; INSERT/UPDATE/DELETE only book owner
ALTER TABLE public.audiobook_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audiobook_assets_select ON public.audiobook_assets;
CREATE POLICY audiobook_assets_select ON public.audiobook_assets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = audiobook_assets.book_id
      AND (b.status = 'PUBLISHED' OR b.author_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS audiobook_assets_insert ON public.audiobook_assets;
CREATE POLICY audiobook_assets_insert ON public.audiobook_assets
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = audiobook_assets.book_id AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS audiobook_assets_update ON public.audiobook_assets;
CREATE POLICY audiobook_assets_update ON public.audiobook_assets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = audiobook_assets.book_id AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS audiobook_assets_delete ON public.audiobook_assets;
CREATE POLICY audiobook_assets_delete ON public.audiobook_assets
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = audiobook_assets.book_id AND b.author_id = auth.uid()
    )
  );
