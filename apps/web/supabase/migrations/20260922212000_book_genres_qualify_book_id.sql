-- book_id in these checks was unqualified. If books ever gains a book_id
-- column, the subquery binds to that instead of the row being written.
-- Name the junction column explicitly.

DROP POLICY IF EXISTS book_genres_insert_authenticated ON public.book_genres;
CREATE POLICY book_genres_insert_authenticated ON public.book_genres
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.books
      WHERE books.id = book_genres.book_id
        AND books.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS book_genres_delete_authenticated ON public.book_genres;
CREATE POLICY book_genres_delete_authenticated ON public.book_genres
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.books
      WHERE books.id = book_genres.book_id
        AND books.author_id = auth.uid()
    )
  );
