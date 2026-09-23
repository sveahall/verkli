-- Fix recursion: books SELECT policy should not reference book_versions (which references books).
-- Revert to simple published-or-owner policy to avoid infinite recursion.

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published books are viewable by everyone" ON public.books;

CREATE POLICY "Published books are viewable by everyone"
  ON public.books FOR SELECT
  USING (status = 'PUBLISHED' OR author_id = auth.uid());
