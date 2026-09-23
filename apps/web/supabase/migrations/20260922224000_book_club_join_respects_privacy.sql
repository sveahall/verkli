-- book_club_members_insert only checked auth.uid() = user_id. A signed-in
-- user who knew a club id could insert themselves into a private club.
-- Membership is what book_club_messages_select and book_clubs_select trust,
-- so that join exposed the club and its messages.
--
-- The creator may still insert their own owner row (the create-club flow
-- does this with role = 'owner'). Everyone else may only join a public club,
-- and only as role 'member'. There is no UPDATE policy, so the role cannot
-- be raised afterwards.

DROP POLICY IF EXISTS book_club_members_insert ON public.book_club_members;
CREATE POLICY book_club_members_insert ON public.book_club_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.book_clubs c
      WHERE c.id = book_club_members.club_id
        AND c.deleted_at IS NULL
        AND (
          c.creator_id = auth.uid()
          OR (c.is_public AND book_club_members.role = 'member')
        )
    )
  );
