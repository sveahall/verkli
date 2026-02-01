-- Translation pipeline v0: is_translation, original_book_id, translation_status

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS is_translation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS translation_status text DEFAULT 'draft';

ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_translation_status_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_translation_status_check
  CHECK (translation_status IN ('draft', 'needs_review', 'ready', 'published'));

COMMENT ON COLUMN public.books.is_translation IS 'True if this book is a translation of another work';
COMMENT ON COLUMN public.books.original_book_id IS 'References the original book on Verkli when this is a translation';
COMMENT ON COLUMN public.books.translation_status IS 'Workflow: draft → needs_review → ready → published';
