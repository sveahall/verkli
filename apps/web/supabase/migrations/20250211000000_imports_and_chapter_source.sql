-- Import pipeline: book_imports table, chapters.source_text/content_hash, minimal translations table
-- Requires: books, chapters (20250101000000), audiobook_assets (20250203000000)

-- ─────────────────────────────────────────────────────────────
-- Book imports (one row per uploaded file / import job)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.book_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_storage TEXT NOT NULL DEFAULT 'local' CHECK (file_storage IN ('local', 'supabase')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'extracting', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS book_imports_author_id_idx ON public.book_imports(author_id);
CREATE INDEX IF NOT EXISTS book_imports_status_idx ON public.book_imports(status);
CREATE INDEX IF NOT EXISTS book_imports_created_at_idx ON public.book_imports(created_at DESC);

DROP TRIGGER IF EXISTS update_book_imports_updated_at ON public.book_imports;
CREATE TRIGGER update_book_imports_updated_at
  BEFORE UPDATE ON public.book_imports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.book_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS book_imports_select ON public.book_imports;
CREATE POLICY book_imports_select ON public.book_imports
  FOR SELECT USING (auth.uid() = author_id);

DROP POLICY IF EXISTS book_imports_insert ON public.book_imports;
CREATE POLICY book_imports_insert ON public.book_imports
  FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS book_imports_update ON public.book_imports;
CREATE POLICY book_imports_update ON public.book_imports
  FOR UPDATE USING (auth.uid() = author_id);

-- ─────────────────────────────────────────────────────────────
-- Chapters: source text and content hash (for import/dedupe)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS source_text TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS chapters_content_hash_idx ON public.chapters(content_hash);
COMMENT ON COLUMN public.chapters.source_text IS 'Raw extracted text from import (before rich content)';
COMMENT ON COLUMN public.chapters.content_hash IS 'Hash of source_text for deduplication';

-- ─────────────────────────────────────────────────────────────
-- Translations (minimal: link translated book to original + status)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  translated_book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(translated_book_id)
);

CREATE INDEX IF NOT EXISTS translations_original_book_id_idx ON public.translations(original_book_id);
CREATE INDEX IF NOT EXISTS translations_translated_book_id_idx ON public.translations(translated_book_id);

DROP TRIGGER IF EXISTS update_translations_updated_at ON public.translations;
CREATE TRIGGER update_translations_updated_at
  BEFORE UPDATE ON public.translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS translations_select ON public.translations;
CREATE POLICY translations_select ON public.translations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.books b WHERE b.id = translations.original_book_id AND b.author_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.books b WHERE b.id = translations.translated_book_id AND b.author_id = auth.uid())
  );

DROP POLICY IF EXISTS translations_insert ON public.translations;
CREATE POLICY translations_insert ON public.translations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.books b WHERE b.id = original_book_id AND b.author_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.books b WHERE b.id = translated_book_id AND b.author_id = auth.uid())
  );

DROP POLICY IF EXISTS translations_update ON public.translations;
CREATE POLICY translations_update ON public.translations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.books b WHERE b.id = translations.original_book_id AND b.author_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.books b WHERE b.id = translations.translated_book_id AND b.author_id = auth.uid())
  );

DROP POLICY IF EXISTS translations_delete ON public.translations;
CREATE POLICY translations_delete ON public.translations
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.books b WHERE b.id = translations.original_book_id AND b.author_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.books b WHERE b.id = translations.translated_book_id AND b.author_id = auth.uid())
  );
