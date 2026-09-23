-- A highlight insert used to check only auth.uid() = user_id. The reader
-- writes highlights straight from the browser, so a signed-in user who knew
-- a chapter id could store a row against a chapter they cannot read, and an
-- update could move that row onto another book.
--
-- The chapter row must belong to the same book and version, still be present,
-- and be visible through can_view_book (or the caller owns the book).

DROP POLICY IF EXISTS highlights_insert_own ON public.highlights;
CREATE POLICY highlights_insert_own ON public.highlights
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.chapters c
      WHERE c.id = highlights.chapter_id
        AND c.book_id = highlights.book_id
        AND c.book_version_id = highlights.book_version_id
        AND c.deleted_at IS NULL
        AND (
          public.can_view_book(c.book_id, auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.books b
            WHERE b.id = c.book_id
              AND b.author_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS highlights_update_own ON public.highlights;
CREATE POLICY highlights_update_own ON public.highlights
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.chapters c
      WHERE c.id = highlights.chapter_id
        AND c.book_id = highlights.book_id
        AND c.book_version_id = highlights.book_version_id
        AND c.deleted_at IS NULL
        AND (
          public.can_view_book(c.book_id, auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.books b
            WHERE b.id = c.book_id
              AND b.author_id = auth.uid()
          )
        )
    )
  );
