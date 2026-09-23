-- "Author manages own chapters" is a dashboard policy. It is PERMISSIVE and
-- only checks chapters.book_id, so it ORs with the version-scoped policies:
-- an author can insert or retarget a chapter onto someone else's
-- book_version_id. The version-scoped policies stay, and they now also
-- require the chapter's book_id to be that version's book.

DROP POLICY IF EXISTS "Author manages own chapters" ON public.chapters;

DROP POLICY IF EXISTS "Authors can insert chapters" ON public.chapters;
CREATE POLICY "Authors can insert chapters"
  ON public.chapters
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.book_versions bv
      JOIN public.books b ON b.id = bv.book_id
      WHERE bv.id = chapters.book_version_id
        AND b.id = chapters.book_id
        AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authors can update own chapters" ON public.chapters;
CREATE POLICY "Authors can update own chapters"
  ON public.chapters
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.book_versions bv
      JOIN public.books b ON b.id = bv.book_id
      WHERE bv.id = chapters.book_version_id
        AND b.id = chapters.book_id
        AND b.author_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.book_versions bv
      JOIN public.books b ON b.id = bv.book_id
      WHERE bv.id = chapters.book_version_id
        AND b.id = chapters.book_id
        AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authors can delete own chapters" ON public.chapters;
CREATE POLICY "Authors can delete own chapters"
  ON public.chapters
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.book_versions bv
      JOIN public.books b ON b.id = bv.book_id
      WHERE bv.id = chapters.book_version_id
        AND b.id = chapters.book_id
        AND b.author_id = auth.uid()
    )
  );
