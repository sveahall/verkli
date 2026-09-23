-- An active poll was readable by everyone, including a poll attached to
-- an unpublished book. The question and the options are the author's draft.
-- The author still sees their own poll. Everyone else sees it when the book
-- is visible, or when the poll names no book.

DROP POLICY IF EXISTS polls_select ON public.polls;
CREATE POLICY polls_select ON public.polls
  FOR SELECT
  USING (
    auth.uid() = author_id
    OR (
      is_active = true
      AND (
        book_id IS NULL
        OR can_view_book(book_id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS poll_options_select ON public.poll_options;
CREATE POLICY poll_options_select ON public.poll_options
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.polls p
      WHERE p.id = poll_options.poll_id
        AND (
          p.author_id = auth.uid()
          OR (
            p.is_active = true
            AND (
              p.book_id IS NULL
              OR can_view_book(p.book_id, auth.uid())
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS poll_votes_insert ON public.poll_votes;
CREATE POLICY poll_votes_insert ON public.poll_votes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.polls p
      WHERE p.id = poll_votes.poll_id
        AND p.is_active = true
        AND (
          p.author_id = auth.uid()
          OR p.book_id IS NULL
          OR can_view_book(p.book_id, auth.uid())
        )
    )
  );
