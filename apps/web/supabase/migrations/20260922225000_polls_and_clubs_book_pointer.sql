-- An active poll and a public book club are readable by anyone, and both
-- rows carry a book id. Insert and update only checked the owner, so that
-- id could be a book the caller cannot see.
--
-- A null book is still allowed. Otherwise the book must be one the caller
-- can already read, or one they wrote. Creating a poll on your own draft
-- still works. Pointing it at someone else's hidden book does not.

DROP POLICY IF EXISTS polls_insert ON public.polls;
CREATE POLICY polls_insert ON public.polls
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND (
      book_id IS NULL
      OR public.can_view_book(book_id, auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.books b
        WHERE b.id = polls.book_id
          AND b.author_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS polls_update ON public.polls;
CREATE POLICY polls_update ON public.polls
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (
    auth.uid() = author_id
    AND (
      book_id IS NULL
      OR public.can_view_book(book_id, auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.books b
        WHERE b.id = polls.book_id
          AND b.author_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS book_clubs_insert ON public.book_clubs;
CREATE POLICY book_clubs_insert ON public.book_clubs
  FOR INSERT TO authenticated
  WITH CHECK (
    creator_id = auth.uid()
    AND (
      current_book_id IS NULL
      OR public.can_view_book(current_book_id, auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.books b
        WHERE b.id = book_clubs.current_book_id
          AND b.author_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS book_clubs_update ON public.book_clubs;
CREATE POLICY book_clubs_update ON public.book_clubs
  FOR UPDATE TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (
    creator_id = auth.uid()
    AND (
      current_book_id IS NULL
      OR public.can_view_book(current_book_id, auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.books b
        WHERE b.id = book_clubs.current_book_id
          AND b.author_id = auth.uid()
      )
    )
  );
