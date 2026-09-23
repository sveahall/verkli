-- Dashboard policy. Not in any earlier migration. It is PERMISSIVE, so it ORs
-- with "Published books are viewable by everyone": any row with
-- status = PUBLISHED is readable even when can_view_book would say no
-- (followers-only, or published status without a public version).
-- Discovery stays on can_view_book. Authors still see their own books.

DROP POLICY IF EXISTS "books public read published" ON public.books;
