-- Repair: book_translations table may not exist if the March 10 migration
-- was tracked as applied but the DDL didn't execute (e.g. schema cache mismatch).
-- All statements use IF NOT EXISTS / IF EXISTS so this is idempotent.

CREATE TABLE IF NOT EXISTS public.book_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  language text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, language)
);

CREATE INDEX IF NOT EXISTS book_translations_book_id_idx ON public.book_translations(book_id);

ALTER TABLE public.book_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS book_translations_select ON public.book_translations;
CREATE POLICY book_translations_select ON public.book_translations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_translations.book_id
        AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS book_translations_insert ON public.book_translations;
CREATE POLICY book_translations_insert ON public.book_translations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_translations.book_id
        AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS book_translations_update ON public.book_translations;
CREATE POLICY book_translations_update ON public.book_translations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_translations.book_id
        AND b.author_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_translations.book_id
        AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS book_translations_delete ON public.book_translations;
CREATE POLICY book_translations_delete ON public.book_translations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_translations.book_id
        AND b.author_id = auth.uid()
    )
  );
