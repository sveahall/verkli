-- Restores `chapters_hide_soft_deleted`, which the previous migration dropped
-- by mistake.
--
-- 20260910130000 dropped every SELECT policy on `public.chapters` to get rid of
-- two hand-written dashboard policies that were OR-ing the paywall open. It
-- filtered on `cmd = 'SELECT'` and nothing else, so it also took
-- `chapters_hide_soft_deleted` — which was RESTRICTIVE, not permissive.
--
-- That distinction is the whole point and the migration missed it:
--
--   PERMISSIVE policies OR together   -> each one GRANTS. Two of these were
--                                        the bug: `books.status = 'PUBLISHED'`
--                                        with no price or version check.
--   RESTRICTIVE policies AND together -> each one REVOKES. This one was the
--                                        safety net that kept soft-deleted
--                                        chapters out of every read.
--
-- Dropping a permissive policy closes a hole. Dropping a restrictive one opens
-- one. The filter treated them identically.
--
-- Measured blast radius: zero. `chapters` currently holds 0 rows with a
-- non-null `deleted_at`, so nothing was exposed between the two pushes. The
-- net has to go back regardless — the first soft-deleted chapter would
-- otherwise stay readable to anyone who can read the book it belongs to.
--
-- Recreated verbatim from the USING expression the previous migration printed
-- before dropping it (that RAISE NOTICE is the only record it ever existed):
--
--   chapters_hide_soft_deleted  RESTRICTIVE  roles={anon,authenticated}
--   USING: (deleted_at IS NULL)

DROP POLICY IF EXISTS chapters_hide_soft_deleted ON public.chapters;
CREATE POLICY chapters_hide_soft_deleted
  ON public.chapters
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL);

COMMENT ON POLICY chapters_hide_soft_deleted ON public.chapters IS
  'RESTRICTIVE: ANDed with the permissive SELECT policy, so it removes soft-deleted rows from every read rather than granting anything. Dropping it does not tighten access, it loosens it.';

-- Sharpen the table comment from 20260910130000. "Exactly one SELECT policy"
-- was the wrong rule and is what made the previous migration drop this one.
COMMENT ON TABLE public.chapters IS
  'Manuscript text. Exactly ONE PERMISSIVE SELECT policy by design: permissive policies OR together, so a second one silently reopens the paywall no matter how strict the first is. RESTRICTIVE policies are a separate matter — they AND together and only ever remove rows, so they may be added freely and must not be dropped when consolidating.';
