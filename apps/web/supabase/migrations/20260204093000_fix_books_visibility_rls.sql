-- Fix RLS recursion between books and book_versions by using a security definer helper.

CREATE OR REPLACE FUNCTION public.can_view_book(book_id uuid, viewer_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.book_versions bv
    JOIN public.books b ON b.id = bv.book_id
    WHERE bv.book_id = book_id
      AND bv.published_at IS NOT NULL
      AND (
        bv.visibility = 'public'
        OR (
          bv.visibility = 'followers'
          AND viewer_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.author_followers f
            WHERE f.author_id = b.author_id
              AND f.follower_id = viewer_id
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Published books are viewable by everyone" ON public.books;
CREATE POLICY "Published books are viewable by everyone"
  ON public.books FOR SELECT
  USING (
    author_id = auth.uid()
    OR public.can_view_book(id, auth.uid())
  );
