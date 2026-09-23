-- SECURITY: anyone could read the full text of a PAID book. Verified live.
--
-- Reproduced against production on 2026-09-10 with the anon key that ships
-- inside the browser bundle:
--
--   1. published a book, set price_amount = 4900 (is_free flips to false)
--   2. GET /rest/v1/chapters?select=title,content&book_id=eq.<id>
--      with apikey = NEXT_PUBLIC_SUPABASE_ANON_KEY
--   3. returned the complete chapter body. No account, no purchase, no order.
--
-- The SELECT policy on `public.chapters` (last written in
-- 20260219120000_chapter_release_publish.sql) asks three questions — is the
-- version published, is it public or followers-only, and is the chapter within
-- published_chapter_count — and never asks whether the reader paid. Price is
-- not mentioned in it at all. Publishing a paid book therefore gave its text
-- away, and the storefront could not have sold a single copy that a reader
-- could not already read for free.
--
-- It stayed invisible because nothing had ever been published: 23 books, 39
-- versions, zero `published_at`. The first real publish is what surfaced it.
--
-- ── The rule ────────────────────────────────────────────────────────────────
--
--   free book      → unchanged, anyone may read the published chapters
--   paid book      → the author, or a reader holding an entitlement
--   book-level entitlement  (chapter_id IS NULL) → every chapter
--   chapter-level entitlement (chapter_id = the row) → that chapter only,
--       which is how the 'Chapter' sales model in the pricing panel is meant
--       to work (entitlements.chapter_id exists precisely for it)
--
-- `is_free` is a GENERATED column on books, derived from price_amount, so it
-- cannot drift from the price the way a hand-maintained boolean would.
--
-- ── Why a SECURITY DEFINER helper ───────────────────────────────────────────
--
-- Referencing `public.entitlements` directly inside a policy on
-- `public.chapters` re-enters that table's own RLS. That is the shape that
-- produced 42P17 (infinite recursion) across the three book_clubs tables and
-- 500'd every request to them — see 20260909120000. A DEFINER function ends
-- the chain: evaluating it does not apply RLS to entitlements.
--
-- Parameters are `p_`-prefixed AND referenced positionally. An unqualified
-- `book_id` inside the body would resolve to the COLUMN, not the parameter,
-- compiling to `e.book_id = e.book_id` — always true, which is exactly the bug
-- that made can_view_book ignore which book it was asked about
-- (20260907170000). A policy that always returns true is the failure being
-- fixed here, so it must not be reintroduced by the fix.

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
  SELECT $3 IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.entitlements e
    WHERE e.book_id = $1
      AND e.user_id = $3
      AND (e.chapter_id IS NULL OR e.chapter_id = $2)
  );
$$;

REVOKE ALL ON FUNCTION public.has_book_entitlement(uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.has_book_entitlement(uuid, uuid, uuid)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.has_book_entitlement(uuid, uuid, uuid) IS
  'Does this user hold an entitlement to this book (or this specific chapter)? SECURITY DEFINER so a policy on chapters can ask without re-entering entitlements RLS — removing that reintroduces the 42P17 recursion class. A null user (anon) is always false.';

-- Replace the policy. Everything except the final AND is carried over verbatim
-- from 20260219120000 so partial chapter release and followers-only visibility
-- keep behaving exactly as they did.
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
            -- The line that was missing.
            AND (
              b.is_free
              OR public.has_book_entitlement(b.id, chapters.id, auth.uid())
            )
          )
        )
    )
  );

-- Note for whoever adds a free sample later: there is no preview concept in
-- this codebase (no is_preview column, no free-chapter count), so a paid book
-- now shows a reader nothing until they buy. That is the correct security
-- posture and a real product gap. A sample belongs in `book_versions` as an
-- explicit free-chapter count, checked here beside published_chapter_count —
-- not as a hole in the paywall.
