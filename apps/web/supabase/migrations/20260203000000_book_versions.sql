-- Book versions + chapters per language
-- Adds book_versions table, links chapters to versions, and updates RLS for versions/chapters.

-- ─────────────────────────────────────────────────────────────
-- Books: original_language (per-book) for default version
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS original_language text;

COMMENT ON COLUMN public.books.original_language IS 'Primary/original language for the book (ISO 639-1).';

-- Backfill from existing language, then default to en
UPDATE public.books
SET original_language = COALESCE(original_language, language, 'en')
WHERE original_language IS NULL;

ALTER TABLE public.books
  ALTER COLUMN original_language SET DEFAULT 'en';

-- ─────────────────────────────────────────────────────────────
-- Book versions (language-specific)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.book_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'translating', 'done', 'failed')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, language_code)
);

CREATE INDEX IF NOT EXISTS book_versions_book_id_idx ON public.book_versions(book_id);
CREATE INDEX IF NOT EXISTS book_versions_language_idx ON public.book_versions(book_id, language_code);

DROP TRIGGER IF EXISTS update_book_versions_updated_at ON public.book_versions;
CREATE TRIGGER update_book_versions_updated_at
  BEFORE UPDATE ON public.book_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Backfill one version per existing book (idempotent)
INSERT INTO public.book_versions (book_id, language_code, status, published_at, created_at, updated_at)
SELECT
  b.id,
  COALESCE(b.language, b.original_language, 'en') AS language_code,
  CASE WHEN b.status = 'PUBLISHED' THEN 'done' ELSE 'draft' END AS status,
  CASE WHEN b.status = 'PUBLISHED' THEN b.published_at ELSE NULL END AS published_at,
  b.created_at,
  b.updated_at
FROM public.books b
ON CONFLICT (book_id, language_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Chapters: link to book_versions
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS book_version_id uuid;

-- Backfill version linkage for existing chapters
UPDATE public.chapters c
SET book_version_id = bv.id
FROM public.book_versions bv
WHERE c.book_version_id IS NULL
  AND c.book_id = bv.book_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chapters_book_version_id_fkey'
  ) THEN
    ALTER TABLE public.chapters
      ADD CONSTRAINT chapters_book_version_id_fkey
      FOREIGN KEY (book_version_id) REFERENCES public.book_versions(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chapters_book_version_id_idx ON public.chapters(book_version_id);

ALTER TABLE public.chapters
  ALTER COLUMN book_version_id SET NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- Book imports: keep track of created version
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.book_imports
  ADD COLUMN IF NOT EXISTS book_version_id uuid REFERENCES public.book_versions(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- RLS: books, book_versions, chapters
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.book_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS book_versions_select ON public.book_versions;
CREATE POLICY book_versions_select ON public.book_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_versions.book_id
      AND b.author_id = auth.uid()
    )
    OR book_versions.published_at IS NOT NULL
  );

DROP POLICY IF EXISTS book_versions_insert ON public.book_versions;
CREATE POLICY book_versions_insert ON public.book_versions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_versions.book_id
      AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS book_versions_update ON public.book_versions;
CREATE POLICY book_versions_update ON public.book_versions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_versions.book_id
      AND b.author_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_versions.book_id
      AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS book_versions_delete ON public.book_versions;
CREATE POLICY book_versions_delete ON public.book_versions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_versions.book_id
      AND b.author_id = auth.uid()
    )
  );

-- Update books select policy to respect published versions
DROP POLICY IF EXISTS "Published books are viewable by everyone" ON public.books;
CREATE POLICY "Published books are viewable by everyone"
  ON public.books FOR SELECT
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.book_versions bv
      WHERE bv.book_id = books.id
      AND bv.published_at IS NOT NULL
    )
  );

-- Chapters policies (replace legacy ones)
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Chapters of published books are viewable" ON public.chapters;
DROP POLICY IF EXISTS "Authors can manage own chapters" ON public.chapters;
DROP POLICY IF EXISTS "Authors can read own chapters" ON public.chapters;
DROP POLICY IF EXISTS "Authors can insert chapters" ON public.chapters;
DROP POLICY IF EXISTS "Authors can update own chapters" ON public.chapters;
DROP POLICY IF EXISTS "Authors can delete own chapters" ON public.chapters;

CREATE POLICY "Chapters of published versions are viewable"
  ON public.chapters FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.book_versions bv
      JOIN public.books b ON b.id = bv.book_id
      WHERE bv.id = chapters.book_version_id
        AND (bv.published_at IS NOT NULL OR b.author_id = auth.uid())
    )
  );

CREATE POLICY "Authors can insert chapters"
  ON public.chapters FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.book_versions bv
      JOIN public.books b ON b.id = bv.book_id
      WHERE bv.id = book_version_id
        AND b.author_id = auth.uid()
    )
  );

CREATE POLICY "Authors can update own chapters"
  ON public.chapters FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.book_versions bv
      JOIN public.books b ON b.id = bv.book_id
      WHERE bv.id = chapters.book_version_id
        AND b.author_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.book_versions bv
      JOIN public.books b ON b.id = bv.book_id
      WHERE bv.id = chapters.book_version_id
        AND b.author_id = auth.uid()
    )
  );

CREATE POLICY "Authors can delete own chapters"
  ON public.chapters FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.book_versions bv
      JOIN public.books b ON b.id = bv.book_id
      WHERE bv.id = chapters.book_version_id
        AND b.author_id = auth.uid()
    )
  );
