-- Fix RLS policy for chapters INSERT
-- The existing policy uses FOR ALL with only USING, but INSERT requires WITH CHECK

-- Drop the existing policy that doesn't work for INSERT
DROP POLICY IF EXISTS "Authors can manage own chapters" ON public.chapters;

-- Create separate policies for better control

-- SELECT: Authors can read chapters from their own books
CREATE POLICY "Authors can read own chapters"
  ON public.chapters FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.books
      WHERE books.id = chapters.book_id
      AND books.author_id = auth.uid()
    )
  );

-- INSERT: Authors can create chapters in their own books
CREATE POLICY "Authors can insert chapters"
  ON public.chapters FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.books
      WHERE books.id = book_id
      AND books.author_id = auth.uid()
    )
  );

-- UPDATE: Authors can update chapters in their own books
CREATE POLICY "Authors can update own chapters"
  ON public.chapters FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.books
      WHERE books.id = chapters.book_id
      AND books.author_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.books
      WHERE books.id = chapters.book_id
      AND books.author_id = auth.uid()
    )
  );

-- DELETE: Authors can delete chapters from their own books
CREATE POLICY "Authors can delete own chapters"
  ON public.chapters FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.books
      WHERE books.id = chapters.book_id
      AND books.author_id = auth.uid()
    )
  );
