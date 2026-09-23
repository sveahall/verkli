-- book_genres was SELECT-open to everyone, so a draft's genres could be
-- read by book id. Discovery still needs published books. can_view_book is
-- the same gate as the books SELECT policy; the author always sees their own.
DROP POLICY IF EXISTS book_genres_select_all ON public.book_genres;
DROP POLICY IF EXISTS book_genres_select_visible ON public.book_genres;
CREATE POLICY book_genres_select_visible ON public.book_genres
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.books b
      WHERE b.id = book_genres.book_id
        AND (
          b.author_id = auth.uid()
          OR public.can_view_book(b.id, auth.uid())
        )
    )
  );
