-- shelf_books had two permissive INSERT policies. One of them only checked
-- that the shelf belongs to the caller, so any book id could be pinned to a
-- shelf. A second SELECT, "Public shelf books are viewable", then hands those
-- rows to anyone when the profile is public. The stricter sibling cannot
-- cancel a permissive policy.
--
-- Writes may target a book the caller wrote or a book they can already see.
-- The public read requires can_view_book, so a draft on a public shelf stays
-- hidden. Own-shelf SELECT policies are unchanged.

DROP POLICY IF EXISTS "Users can add books to own shelves" ON public.shelf_books;
DROP POLICY IF EXISTS shelf_books_insert_own ON public.shelf_books;
CREATE POLICY shelf_books_insert_own ON public.shelf_books
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.shelves s
      WHERE s.id = shelf_books.shelf_id
        AND s.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.books b
      WHERE b.id = shelf_books.book_id
        AND (
          b.author_id = auth.uid()
          OR public.can_view_book(b.id, auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Users can update books in own shelves" ON public.shelf_books;
DROP POLICY IF EXISTS shelf_books_update_own ON public.shelf_books;
CREATE POLICY shelf_books_update_own ON public.shelf_books
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shelves s
      WHERE s.id = shelf_books.shelf_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.shelves s
      WHERE s.id = shelf_books.shelf_id
        AND s.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.books b
      WHERE b.id = shelf_books.book_id
        AND (
          b.author_id = auth.uid()
          OR public.can_view_book(b.id, auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Public shelf books are viewable" ON public.shelf_books;
CREATE POLICY shelf_books_select_public ON public.shelf_books
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.shelves s
      JOIN public.profiles p ON p.user_id = s.user_id
      WHERE s.id = shelf_books.shelf_id
        AND p.is_public = true
    )
    AND public.can_view_book(shelf_books.book_id, auth.uid())
  );
