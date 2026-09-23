-- Live policy drifted to `books.status = PUBLISHED`, which ignores visibility.
-- Restore the version in 20260207090000: the author, or anyone can_view_book
-- already allows. The audiobooks bucket is already private, so the path is
-- not a public download; this stops the row itself being world-readable.

DROP POLICY IF EXISTS audiobook_assets_select ON public.audiobook_assets;
CREATE POLICY audiobook_assets_select ON public.audiobook_assets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.books b
      WHERE b.id = audiobook_assets.book_id
        AND b.author_id = auth.uid()
    )
    OR public.can_view_book(audiobook_assets.book_id, auth.uid())
  );
