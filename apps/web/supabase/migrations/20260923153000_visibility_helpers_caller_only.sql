-- can_view_book, has_book_entitlement and is_book_club_member are SECURITY
-- DEFINER so a row policy can ask a question the caller cannot ask through
-- the table. Each one takes the user id as an argument, and nothing checked
-- that the argument was the caller. The public anon key could therefore ask
-- whether some other user had bought a book, could see a followers-only book,
-- or belonged to a club.
--
-- Every policy passes auth.uid(). A null viewer stays allowed: anon policies
-- pass a null uid, and can_view_book treats that as the public-visibility check.

CREATE OR REPLACE FUNCTION public.can_view_book(book_id uuid, viewer_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT (
    $2 IS NULL OR $2 IS NOT DISTINCT FROM auth.uid()
  ) AND EXISTS (
    SELECT 1
    FROM public.book_versions bv
    JOIN public.books b ON b.id = bv.book_id
    WHERE bv.book_id = $1
      AND bv.published_at IS NOT NULL
      AND (
        bv.visibility = 'public'
        OR (
          bv.visibility = 'followers'
          AND $2 IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.author_followers f
            WHERE f.author_id = b.author_id
              AND f.follower_id = $2
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_book_entitlement(
  p_book_id uuid,
  p_chapter_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
  SELECT $3 IS NOT NULL
    AND $3 IS NOT DISTINCT FROM auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.entitlements e
      WHERE e.book_id = $1
        AND e.user_id = $3
        AND (e.chapter_id IS NULL OR e.chapter_id = $2)
    );
$$;

CREATE OR REPLACE FUNCTION public.is_book_club_member(p_club_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p_user_id IS NOT NULL
    AND p_user_id IS NOT DISTINCT FROM auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.book_club_members m
      WHERE m.club_id = p_club_id
        AND m.user_id = p_user_id
    );
$$;
