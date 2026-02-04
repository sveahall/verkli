-- Fix chapters unique constraint for multi-version books
-- Change from (book_id, order) to (book_version_id, order)

-- Drop the old constraint (if it exists)
ALTER TABLE public.chapters
  DROP CONSTRAINT IF EXISTS chapters_book_id_order_key;

-- Drop old index if it exists
DROP INDEX IF EXISTS chapters_book_order_idx;

-- Create new unique constraint on (book_version_id, order)
ALTER TABLE public.chapters
  ADD CONSTRAINT chapters_book_version_id_order_key UNIQUE (book_version_id, "order");

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS chapters_book_version_order_idx ON public.chapters(book_version_id, "order");
