-- SECURITY: can_view_book ignored which book it was asked about.
--
-- The predicate read `WHERE bv.book_id = book_id`. `book_id` is BOTH the
-- function's first parameter and a column of `public.book_versions` (and of
-- `public.books`). In a LANGUAGE sql function body PostgreSQL resolves an
-- unqualified name to the COLUMN, not the parameter, so this compiled to
-- `bv.book_id = bv.book_id` — always true.
--
-- The function therefore stopped answering "is THIS book public?" and answered
-- "does ANY published public version exist on the platform?". It is
-- SECURITY DEFINER with `SET row_security = off`, and three SELECT policies
-- delegate to it:
--     books                (20260204093000)
--     audiobook_assets     (20260207090000, audiobook_assets_select)
--     comments             (20260210110003, comments_select_visible_books)
-- so the first published book would have flipped all three permissive for
-- every caller — including `anon`, whose key ships inside the client bundle.
-- Every author's unpublished manuscript titles and descriptions, every
-- audiobook storage path, every comment, readable with one curl. Measured
-- 2026-09-07: `POST /rest/v1/rpc/can_view_book` with the anon key returns 200,
-- so the function is directly callable from the internet.
--
-- It returned `false` for everything only because zero versions were published
-- at the time. That is a coincidence of state, not a protection.
--
-- `viewer_id` is NOT shadowed (no table in this query has such a column), so
-- only the book-identity half was broken. Both are switched to positional
-- references anyway: `$1`/`$2` cannot be captured by a column, whatever gets
-- added to these tables later.
--
-- Deliberately NOT renaming the parameters to p_book_id/p_viewer_id.
-- PostgreSQL cannot change an input parameter's name with CREATE OR REPLACE
-- ("cannot change name of input parameter"), so that would require
-- DROP FUNCTION — and the three policies above depend on it, so the drop
-- either fails or, with CASCADE, silently deletes the policies and leaves the
-- tables wide open. Same signature, no drop, policies untouched.

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

COMMENT ON FUNCTION public.can_view_book(uuid, uuid) IS
  'Is the given book publicly visible to the given viewer? Uses $1/$2 rather than the parameter names on purpose: `book_id` is also a column on book_versions and books, and an unqualified reference resolves to the column, which made this function ignore its argument entirely. Three RLS policies depend on it (books, audiobook_assets, comments).';
