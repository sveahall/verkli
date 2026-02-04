-- Add visibility levels for published book versions and followers-only access.

-- ─────────────────────────────────────────────────────────────
-- Book versions: visibility
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.book_versions
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'followers', 'private'));

UPDATE public.book_versions
SET visibility = COALESCE(visibility, 'public')
WHERE visibility IS NULL;

-- ─────────────────────────────────────────────────────────────
-- Author followers (for followers-only visibility)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.author_followers (
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (author_id, follower_id)
);

CREATE INDEX IF NOT EXISTS author_followers_author_idx ON public.author_followers(author_id);
CREATE INDEX IF NOT EXISTS author_followers_follower_idx ON public.author_followers(follower_id);

ALTER TABLE public.author_followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS author_followers_select ON public.author_followers;
CREATE POLICY author_followers_select ON public.author_followers
  FOR SELECT
  USING (author_id = auth.uid() OR follower_id = auth.uid());

DROP POLICY IF EXISTS author_followers_insert ON public.author_followers;
CREATE POLICY author_followers_insert ON public.author_followers
  FOR INSERT
  WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS author_followers_delete ON public.author_followers;
CREATE POLICY author_followers_delete ON public.author_followers
  FOR DELETE
  USING (author_id = auth.uid() OR follower_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- RLS: book_versions, books, chapters (respect visibility)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS book_versions_select ON public.book_versions;
CREATE POLICY book_versions_select ON public.book_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_versions.book_id
      AND b.author_id = auth.uid()
    )
    OR (
      book_versions.published_at IS NOT NULL
      AND (
        book_versions.visibility = 'public'
        OR (
          book_versions.visibility = 'followers'
          AND EXISTS (
            SELECT 1
            FROM public.author_followers f
            JOIN public.books b ON b.id = book_versions.book_id
            WHERE f.author_id = b.author_id
              AND f.follower_id = auth.uid()
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "Published books are viewable by everyone" ON public.books;
CREATE POLICY "Published books are viewable by everyone"
  ON public.books FOR SELECT
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.book_versions bv
      WHERE bv.book_id = books.id
      AND bv.published_at IS NOT NULL
      AND (
        bv.visibility = 'public'
        OR (
          bv.visibility = 'followers'
          AND EXISTS (
            SELECT 1
            FROM public.author_followers f
            WHERE f.author_id = books.author_id
              AND f.follower_id = auth.uid()
          )
        )
      )
    )
  );

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
          )
        )
    )
  );
