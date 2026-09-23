-- MVP: Language and original source as first-class concepts on books
-- Adds: language (e.g. en, es, fr), original_source, original_url (e.g. Amazon link)

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS original_source TEXT,
  ADD COLUMN IF NOT EXISTS original_url TEXT;

-- Default existing rows to English for backwards compatibility
UPDATE public.books SET language = 'en' WHERE language IS NULL;

-- Default for new rows
ALTER TABLE public.books ALTER COLUMN language SET DEFAULT 'en';

COMMENT ON COLUMN public.books.language IS 'ISO 639-1 language code (e.g. en, es, fr)';
COMMENT ON COLUMN public.books.original_source IS 'Source of original work (e.g. Amazon, print)';
COMMENT ON COLUMN public.books.original_url IS 'URL to original (e.g. Amazon product page)';
