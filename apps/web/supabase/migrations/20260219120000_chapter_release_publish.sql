-- Support chapter-by-chapter publishing on book versions.

ALTER TABLE public.book_versions
  ADD COLUMN IF NOT EXISTS published_chapter_count integer
  CHECK (published_chapter_count IS NULL OR published_chapter_count >= 0);

COMMENT ON COLUMN public.book_versions.published_chapter_count IS
  'If NULL, all chapters in the version are public when published. If set, only chapters with order < published_chapter_count are public.';

-- Update chapter visibility policy to respect partial chapter release.
DROP POLICY IF EXISTS "Chapters of published versions are viewable" ON public.chapters;
CREATE POLICY "Chapters of published versions are viewable"
  ON public.chapters FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.book_versions bv
      JOIN public.books b ON b.id = bv.book_id
      WHERE bv.id = chapters.book_version_id
        AND (
          b.author_id = auth.uid()
          OR (
            bv.published_at IS NOT NULL
            AND (
              bv.visibility = 'public'
              OR (
                bv.visibility = 'followers'
                AND EXISTS (
                  SELECT 1
                  FROM public.author_followers f
                  WHERE f.author_id = b.author_id
                    AND f.follower_id = auth.uid()
                )
              )
            )
            AND (
              bv.published_chapter_count IS NULL
              OR chapters."order" < bv.published_chapter_count
            )
          )
        )
    )
  );
