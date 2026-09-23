ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS cover_copy jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.books.cover_copy IS
  'Author cover copy: authorLine (short back-cover bio), dustJacket (hardcover flaps), flapText (longer author note).';
