-- Add trailer support to books table.
-- trailer_status: NULL (no trailer), 'generating', 'ready', 'failed'

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS trailer_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trailer_status TEXT DEFAULT NULL;

COMMENT ON COLUMN public.books.trailer_url IS 'Public URL of the stitched trailer MP4 in marketing-media bucket';
COMMENT ON COLUMN public.books.trailer_status IS 'NULL=no trailer, generating, ready, failed';

CREATE INDEX IF NOT EXISTS idx_books_trailer_status
  ON public.books (trailer_status)
  WHERE trailer_status IS NOT NULL;
