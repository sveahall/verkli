-- reviews_select was USING (true). A review on a draft, including the
-- reviewer's user id and the text, was readable by anyone who knew the book
-- id. Public books stay readable through can_view_book. The author still sees
-- reviews on their own book. Inserts and updates have to pass the same gate,
-- so a signed-in user cannot attach or move a review onto a book they cannot see.

DROP POLICY IF EXISTS reviews_select ON public.reviews;
CREATE POLICY reviews_select ON public.reviews
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      public.can_view_book(book_id, auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.books b
        WHERE b.id = reviews.book_id
          AND b.author_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS reviews_insert_own ON public.reviews;
CREATE POLICY reviews_insert_own ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      public.can_view_book(book_id, auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.books b
        WHERE b.id = reviews.book_id
          AND b.author_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS reviews_update_own ON public.reviews;
CREATE POLICY reviews_update_own ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      public.can_view_book(book_id, auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.books b
        WHERE b.id = reviews.book_id
          AND b.author_id = auth.uid()
      )
    )
  );
