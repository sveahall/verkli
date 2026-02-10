-- Community baseline: comments + follows
-- - comments on books/chapters
-- - one-level reply threads via parent_comment_id
-- - follows relationships (reader -> author/reader)

-- ─────────────────────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_book_id_idx ON public.comments(book_id);
CREATE INDEX IF NOT EXISTS comments_chapter_id_idx ON public.comments(chapter_id);
CREATE INDEX IF NOT EXISTS comments_author_id_idx ON public.comments(author_id);
CREATE INDEX IF NOT EXISTS comments_parent_comment_id_idx ON public.comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS comments_created_at_idx ON public.comments(created_at);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comments_select_visible_books ON public.comments;
CREATE POLICY comments_select_visible_books ON public.comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.books b
      WHERE b.id = comments.book_id
        AND (
          b.author_id = auth.uid()
          OR public.can_view_book(b.id, auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS comments_insert_authenticated ON public.comments;
CREATE POLICY comments_insert_authenticated ON public.comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1
      FROM public.books b
      WHERE b.id = comments.book_id
        AND (
          b.author_id = auth.uid()
          OR public.can_view_book(b.id, auth.uid())
        )
    )
    AND (
      chapter_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.chapters c
        WHERE c.id = comments.chapter_id
          AND c.book_id = comments.book_id
      )
    )
    AND (
      parent_comment_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.comments parent
        WHERE parent.id = comments.parent_comment_id
          AND parent.book_id = comments.book_id
          AND (
            (parent.chapter_id IS NULL AND comments.chapter_id IS NULL)
            OR parent.chapter_id = comments.chapter_id
          )
          AND parent.parent_comment_id IS NULL
      )
    )
  );

DROP POLICY IF EXISTS comments_delete_owner_or_book_author ON public.comments;
CREATE POLICY comments_delete_owner_or_book_author ON public.comments
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = comments.author_id
    OR EXISTS (
      SELECT 1
      FROM public.books b
      WHERE b.id = comments.book_id
        AND b.author_id = auth.uid()
    )
  );

COMMENT ON TABLE public.comments IS 'Community comments on books and chapters; supports one-level replies.';

-- ─────────────────────────────────────────────────────────────
-- Follows
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT follows_not_self CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS follows_follower_id_idx ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS follows_followee_id_idx ON public.follows(followee_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS follows_select_self ON public.follows;
CREATE POLICY follows_select_self ON public.follows
  FOR SELECT
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = followee_id);

DROP POLICY IF EXISTS follows_insert_own ON public.follows;
CREATE POLICY follows_insert_own ON public.follows
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS follows_delete_own ON public.follows;
CREATE POLICY follows_delete_own ON public.follows
  FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

COMMENT ON TABLE public.follows IS 'Follow relationships for reader feed readiness.';
